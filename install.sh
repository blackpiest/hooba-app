#!/usr/bin/env bash
# Hooba — установка и обслуживание своего сервера.
# Установка одной командой (скрипт сам скачает Hooba в /opt/hooba):
#   bash <(curl -Ls https://raw.githubusercontent.com/blackpiest/hooba-app/main/install.sh)
# Или из корня клонированного репозитория:
#   chmod +x install.sh && ./install.sh install
# После установки скрипт доступен из любой папки как команда hooba (hooba help).

set -Eeuo pipefail

# hooba — ссылка на этот файл: папку Hooba ищем по настоящему пути, а не по ссылке.
# При bash <(curl …) путь — канал (/dev/fd/N), его не раскрываем: сработает bootstrap_from_web.
SCRIPT_PATH="${BASH_SOURCE[0]}"
if [[ -L "$SCRIPT_PATH" && -f "$SCRIPT_PATH" ]]; then SCRIPT_PATH="$(readlink -f "$SCRIPT_PATH")"; fi
REPO_ROOT="$(cd "$(dirname "$SCRIPT_PATH")" && pwd -P)"
COMPOSE_REL="infra/docker/docker-compose.prod.yml"
ENV_REL="infra/docker/.env.prod"
COMPOSE_FILE="${REPO_ROOT}/${COMPOSE_REL}"
ENV_FILE="${REPO_ROOT}/${ENV_REL}"
LOG_DIR="${REPO_ROOT}/logs"
BACKUP_DIR="${REPO_ROOT}/backups"
# Что было до последнего update — для hooba rollback.
UPDATE_STATE="${LOG_DIR}/last-update.env"
CRON_BACKUP_FILE="/etc/cron.d/hooba-backup"
AUTO_BACKUP_KEEP=14

# Откуда и куда скачивать Hooba при запуске одной командой (bootstrap_from_web).
HOOBA_REPO="${HOOBA_REPO:-https://github.com/blackpiest/hooba-app.git}"
HOOBA_BRANCH="${HOOBA_BRANCH:-main}"
HOOBA_DIR="${HOOBA_DIR:-/opt/hooba}"
HOOBA_ONE_LINER="bash <(curl -Ls https://raw.githubusercontent.com/blackpiest/hooba-app/main/install.sh)"
# Команда hooba из любой папки (ensure_cli_link).
CLI_LINK="/usr/local/bin/hooba"

TURN_PORT=3478
TURN_TLS_PORT=5349
TURN_MIN_PORT=50000
TURN_MAX_PORT=50100
MEDIASOUP_RTC_MIN_PORT=40000
MEDIASOUP_RTC_MAX_PORT=40100

GIB=1073741824
# Квота картинок чата (UPLOADS_MAX_BYTES backend): при 80% старые картинки удаляются до 70%.
UPLOADS_DEFAULT_GIB=5
UPLOADS_MIN_BYTES=104857600 # минимум backend (env.ts)

# Сертификат на IP: certbot 5.3+ и профиль shortlived (Let's Encrypt выдаёт IP-сертификаты только на 6 дней).
CERTBOT_IP_MIN_VERSION="5.3.0"

# ---------------------------------------------------------------------------
# Вывод, журнал, ошибки
# ---------------------------------------------------------------------------

LOG_FILE=""
CURRENT_STEP=""
STEP_HINT=""

log_line() {
  echo "[$(date '+%F %T')] $*"
}

# Весь вывод команды (в т.ч. docker, certbot) дублируется в logs/<имя>.log.
start_log() {
  mkdir -p "$LOG_DIR"
  chmod 700 "$LOG_DIR"
  LOG_FILE="${LOG_DIR}/$1.log"
  touch "$LOG_FILE"
  chmod 600 "$LOG_FILE"
  exec > >(tee -a "$LOG_FILE") 2>&1
  # При выходе дождаться tee: иначе хвост вывода (в т.ч. текст ошибки) печатается
  # уже после приглашения терминала или меню.
  LOG_TEE_PID=$!
  trap 'exec >&- 2>&-; wait "$LOG_TEE_PID" 2>/dev/null || true' EXIT
  log_line "=== $1 ==="
}

# Шаг с подсказкой: если команда внутри шага упадёт, владелец увидит, что проверить.
step() {
  CURRENT_STEP="$1"
  STEP_HINT="${2:-}"
  log_line "▶ $1"
}

on_error() {
  local code="$1" cmd="$2"
  trap - ERR
  echo
  log_line "ОШИБКА на шаге «${CURRENT_STEP:-подготовка}» (код ${code})."
  echo "  Команда: ${cmd}"
  if [[ -n "$STEP_HINT" ]]; then
    echo "Что проверить:"
    printf '%b\n' "$STEP_HINT"
  fi
  if [[ -n "$LOG_FILE" ]]; then
    echo "Полный журнал: ${LOG_FILE}"
  fi
  echo "Исправив причину, запустите ту же команду ещё раз — повторный запуск безопасен."
  exit "$code"
}
trap 'on_error $? "$BASH_COMMAND"' ERR

die() {
  trap - ERR
  echo
  log_line "ОШИБКА: $*"
  if [[ -n "$LOG_FILE" ]]; then
    echo "Полный журнал: ${LOG_FILE}"
  fi
  exit 1
}

# ---------------------------------------------------------------------------
# Общие помощники
# ---------------------------------------------------------------------------

compose() {
  (cd "$REPO_ROOT" && docker compose --env-file "$ENV_REL" -f "$COMPOSE_REL" "$@")
}

# git от имени владельца каталога: от root git отказывается работать в чужом репо
# («dubious ownership»), а файлы после pull остались бы принадлежать root.
repo_git() {
  local owner home
  owner="$(stat -c %U "$REPO_ROOT")"
  if [[ "$owner" != "root" ]] && command -v runuser >/dev/null 2>&1; then
    home="$(getent passwd "$owner" | cut -d: -f6)"
    runuser -u "$owner" -- env HOME="${home:-/tmp}" git -C "$REPO_ROOT" "$@"
  else
    git -c safe.directory="$REPO_ROOT" -C "$REPO_ROOT" "$@"
  fi
}

rand_hex() {
  head -c "${1:-32}" /dev/urandom | od -An -tx1 | tr -d ' \n'
}

prompt_default() {
  local var="$1" prompt="$2" def="$3"
  local val
  read -r -p "$prompt [$def]: " val || true
  if [[ -z "${val// }" ]]; then
    printf -v "$var" '%s' "$def"
  else
    printf -v "$var" '%s' "$val"
  fi
}

prompt_yn() {
  local prompt="$1" def="${2:-n}" hint="y/N" ans
  if [[ "$def" == "y" ]]; then hint="Y/n"; fi
  read -r -p "$prompt ($hint): " ans || true
  ans="${ans:-$def}"
  ans="$(printf '%s' "$ans" | tr '[:upper:]' '[:lower:]')"
  [[ "$ans" == "y" || "$ans" == "yes" || "$ans" == "д" || "$ans" == "да" ]]
}

env_value() {
  local key="$1" line
  [[ -f "$ENV_FILE" ]] || return 0
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  line="${line#*=}"
  printf '%s' "${line//$'\r'/}"
}

# Заменяет KEY=… в .env.prod или дописывает в конец. Значение — без спецсимволов sed (числа, пути).
set_env_value() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
}

detect_public_ip() {
  curl -4 -fsS --max-time 5 https://ifconfig.me/ip 2>/dev/null || curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true
}

is_ipv4() {
  [[ "${1:-}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

validate_domain() {
  [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]
}

# Let's Encrypt не выдаёт сертификат на частный/служебный адрес — его не проверить из интернета.
is_public_ipv4() {
  local ip="$1" a b c d o
  is_ipv4 "$ip" || return 1
  [[ "$ip" =~ (^|\.)0[0-9] ]] && return 1
  IFS=. read -r a b c d <<<"$ip"
  for o in "$a" "$b" "$c" "$d"; do ((10#$o <= 255)) || return 1; done
  ((a == 0 || a == 10 || a == 127 || a >= 224)) && return 1
  ((a == 100 && b >= 64 && b <= 127)) && return 1
  ((a == 169 && b == 254)) && return 1
  ((a == 172 && b >= 16 && b <= 31)) && return 1
  ((a == 192 && b == 168)) && return 1
  return 0
}

version_ge() {
  [[ "$(printf '%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]
}

# Свободное место там, где docker хранит образы и тома (база, картинки).
docker_free_bytes() {
  local root
  root="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || true)"
  [[ -n "$root" && -d "$root" ]] || root=/var/lib
  df -B1 --output=avail "$root" 2>/dev/null | tail -n1 | tr -d ' ' || true
}

# ГиБ (можно дробно: 0.5) → байты; пусто, если ввод не число или меньше минимума backend.
gib_to_bytes() {
  [[ "$1" =~ ^[0-9]+([.,][0-9]+)?$ ]] || return 0
  awk -v g="${1/,/.}" -v gib="$GIB" -v min="$UPLOADS_MIN_BYTES" \
    'BEGIN { b = int(g * gib); if (b >= min) printf "%.0f", b }'
}

fmt_gib() {
  awk -v b="$1" -v gib="$GIB" 'BEGIN { printf "%.1f", b / gib }'
}

# ---------------------------------------------------------------------------
# Подготовка системы
# ---------------------------------------------------------------------------

# certbot, /etc/letsencrypt, ufw, docker — всё требует root, поэтому скрипт сам перезапускается через sudo.
ensure_root() {
  [[ "$EUID" -eq 0 ]] && return 0
  command -v sudo >/dev/null 2>&1 || {
    echo "Нужны права администратора. Войдите под root (команда su) и запустите: ${REPO_ROOT}/install.sh $*"
    exit 1
  }
  echo "Нужны права администратора — запрашиваю sudo."
  exec sudo -E bash "${REPO_ROOT}/install.sh" "$@"
}

# /usr/local/bin/hooba → этот install.sh. Создаётся при любой команде, поэтому появляется
# и у установок, сделанных до её введения. Ссылку на другую установку Hooba не перебиваем.
ensure_cli_link() {
  local target="${REPO_ROOT}/install.sh" current
  [[ -d "${CLI_LINK%/*}" ]] || return 0
  current="$(readlink -f "$CLI_LINK" 2>/dev/null || true)"
  [[ "$current" == "$target" ]] && return 0
  if [[ -e "$CLI_LINK" && ! -L "$CLI_LINK" ]]; then
    log_line "Предупреждение: ${CLI_LINK} — чужой файл, команду hooba не включаю. Запускайте ${target}."
    return 0
  fi
  [[ -n "$current" && -f "$current" && "$current" == */install.sh ]] && return 0
  ln -sfn "$target" "$CLI_LINK" || return 0
  log_line "Команда hooba включена: управлять сервером можно из любой папки (hooba help)."
}

# Скрипт запущен не из папки Hooba (bash <(curl …) или скачан отдельно): скачиваем
# репозиторий в HOOBA_DIR и передаём управление его install.sh. Перезапустить себя
# через sudo тут нельзя — скрипт пришёл из канала, поэтому sudo — на каждую команду.
bootstrap_from_web() {
  local -a sudo_cmd=()
  if [[ ! -t 0 ]]; then
    echo "Скрипт задаёт вопросы, а ввод с клавиатуры ему недоступен (запуск через curl … | bash)."
    echo "Запустите так:"
    echo "  ${HOOBA_ONE_LINER}"
    exit 1
  fi
  if [[ "$EUID" -ne 0 ]]; then
    command -v sudo >/dev/null 2>&1 || {
      echo "Нужны права администратора. Войдите под root (команда su) и запустите снова:"
      echo "  ${HOOBA_ONE_LINER}"
      exit 1
    }
    echo "Нужны права администратора — запрашиваю sudo."
    sudo_cmd=(sudo)
  fi

  echo "Hooba будет установлен в папку ${HOOBA_DIR}."
  if ! command -v git >/dev/null 2>&1; then
    step "Установка git" "  - есть ли у сервера интернет: curl -I https://github.com\n  - система — Ubuntu или Debian? На других установите git вручную"
    command -v apt-get >/dev/null 2>&1 || die "Не найден git, а установить его скрипт умеет только на Ubuntu / Debian. Установите git и запустите снова."
    log_line "Устанавливаю git (нужен, чтобы скачивать Hooba и его обновления)."
    "${sudo_cmd[@]}" apt-get update -qq
    "${sudo_cmd[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git
  fi

  if [[ -f "${HOOBA_DIR}/${COMPOSE_REL}" ]]; then
    log_line "Hooba уже скачан в ${HOOBA_DIR} — запускаю его install.sh."
  elif [[ -e "$HOOBA_DIR" && -n "$(ls -A "$HOOBA_DIR" 2>/dev/null)" ]]; then
    die "Папка ${HOOBA_DIR} уже занята чем-то другим. Перенесите её содержимое или выберите другую папку: HOOBA_DIR=/opt/hooba2 ${HOOBA_ONE_LINER}"
  else
    step "Скачивание Hooba" "  - есть ли у сервера интернет: curl -I https://github.com\n  - хватает ли места на диске: df -h"
    "${sudo_cmd[@]}" git clone -q --branch "$HOOBA_BRANCH" "$HOOBA_REPO" "$HOOBA_DIR"
    log_line "Hooba скачан в ${HOOBA_DIR}."
  fi
  "${sudo_cmd[@]}" chmod +x "${HOOBA_DIR}/install.sh"
  echo
  trap - ERR
  cd "$HOOBA_DIR"
  exec "${sudo_cmd[@]}" bash "${HOOBA_DIR}/install.sh" "${@:-install}"
}

apt_install() {
  command -v apt-get >/dev/null 2>&1 || return 1
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@"
}

ensure_tools() {
  local missing=() t
  for t in curl gzip; do
    command -v "$t" >/dev/null 2>&1 || missing+=("$t")
  done
  ((${#missing[@]} == 0)) && return 0
  log_line "Не хватает программ: ${missing[*]}."
  prompt_yn "Установить их?" "y" || die "Без них продолжить нельзя: ${missing[*]}."
  apt_install "${missing[@]}" || die "Не удалось установить ${missing[*]}. Установите вручную через пакетный менеджер системы."
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log_line "Docker не установлен — без него сервер не запустить."
    prompt_yn "Установить Docker официальным скриптом (get.docker.com)?" "y" \
      || die "Установите Docker по инструкции https://docs.docker.com/engine/install/ и запустите снова."
    step "Установка Docker" "  - есть ли у сервера интернет: curl -I https://get.docker.com\n  - поддерживается ли система: Ubuntu / Debian свежих версий"
    curl -fsSL https://get.docker.com | sh
  fi
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable --now docker >/dev/null 2>&1 || true
  fi
  docker info >/dev/null 2>&1 \
    || die "Docker установлен, но не работает. Попробуйте: systemctl restart docker; причина — в journalctl -u docker -n 50"
  if ! docker compose version >/dev/null 2>&1; then
    log_line "Нет docker compose v2."
    if prompt_yn "Установить docker-compose-plugin?" "y"; then
      apt_install docker-compose-plugin || true
    fi
    docker compose version >/dev/null 2>&1 \
      || die "Нужен Docker Compose v2 (команда docker compose): https://docs.docker.com/compose/install/linux/"
  fi
}

require_repo() {
  [[ -f "$COMPOSE_FILE" ]] || die "Не найден ${COMPOSE_REL}. Запускайте скрипт из папки, куда скачан Hooba (git clone)."
  ensure_tools
  ensure_docker
}

require_env() {
  [[ -f "$ENV_FILE" ]] || die "Сервер ещё не установлен (нет ${ENV_REL}). Сначала: hooba install"
}

create_swap() {
  if [[ -e /swapfile ]]; then
    log_line "/swapfile уже существует — пропускаю."
    return 0
  fi
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  log_line "Swap 2 ГиБ включён и будет подключаться после перезагрузки."
}

preflight() {
  step "Проверка ресурсов сервера"
  local mb swap_mb free
  if [[ -r /proc/meminfo ]]; then
    mb=$(awk '/MemTotal:/ { printf "%.0f", $2/1024 }' /proc/meminfo)
    swap_mb=$(awk '/SwapTotal:/ { printf "%.0f", $2/1024 }' /proc/meminfo)
    log_line "Память: ~${mb} МиБ, swap: ~${swap_mb} МиБ."
    if ((mb < 1800 && swap_mb < 1024)); then
      log_line "Памяти меньше 2 ГиБ и нет swap: сборка веб-версии может упасть из-за нехватки памяти."
      if prompt_yn "Создать swap-файл на 2 ГиБ (/swapfile)? Рекомендуется" "y"; then
        create_swap
      fi
    fi
  fi
  free="$(docker_free_bytes)"
  if [[ -n "$free" ]]; then
    log_line "Свободно на диске: ~$(fmt_gib "$free") ГиБ."
    if ((free < 5 * GIB)); then
      log_line "Для сборки и работы нужно хотя бы 5 ГиБ свободного места."
      prompt_yn "Продолжить всё равно?" "n" || die "Освободите место на диске и запустите снова."
    fi
  fi
}

# Имя программы, которая слушает TCP-порт (пусто — порт свободен).
port_owner() {
  ss -Htlnp "sport = :$1" 2>/dev/null | grep -o 'users:(("[^"]*"' | head -n1 | cut -d'"' -f2 || true
}

ensure_port_free() {
  local p="$1" owner
  command -v ss >/dev/null 2>&1 || return 0
  owner="$(port_owner "$p")"
  [[ -z "$owner" ]] && return 0
  case "$owner" in
    docker-proxy)
      die "Порт ${p} занят другим docker-контейнером. Посмотрите список: docker ps — и остановите лишний: docker stop <имя>."
      ;;
    nginx | apache2 | httpd | caddy | lighttpd | turnserver)
      log_line "Порт ${p} занят программой ${owner}, установленной в системе. Hooba запускает свои nginx и coturn в контейнерах."
      prompt_yn "Остановить ${owner} и отключить его автозапуск?" "y" || die "Освободите порт ${p} и запустите снова."
      systemctl disable --now "$owner" || die "Не удалось остановить ${owner}. Остановите вручную: systemctl stop ${owner}"
      ;;
    *)
      die "Порт ${p} занят программой «${owner}». Остановите её и запустите установку снова."
      ;;
  esac
}

# Порт SSH текущей сессии — чтобы брандмауэр не отрезал доступ к серверу.
detect_ssh_port() {
  local p=""
  if [[ -n "${SSH_CONNECTION:-}" ]]; then
    p="$(awk '{ print $4 }' <<<"$SSH_CONNECTION")"
  fi
  if [[ -z "$p" ]] && command -v ss >/dev/null 2>&1; then
    p="$(ss -Htlnp 2>/dev/null | awk '/"sshd"/ { n = split($4, a, ":"); print a[n]; exit }' || true)"
  fi
  printf '%s' "${p:-22}"
}

print_ports_reminder() {
  cat <<EOF

Если у хостинга есть свой брандмауэр (в панели: Firewall, Security groups, «Сетевой экран»),
откройте там входящие порты — иначе сайт или голос не будут работать снаружи:
  TCP: 80, 443, ${TURN_PORT}, ${TURN_TLS_PORT}, ${MEDIASOUP_RTC_MIN_PORT}-${MEDIASOUP_RTC_MAX_PORT}
  UDP: ${TURN_PORT}, ${MEDIASOUP_RTC_MIN_PORT}-${MEDIASOUP_RTC_MAX_PORT}, ${TURN_MIN_PORT}-${TURN_MAX_PORT}

EOF
}

setup_firewall() {
  local ssh_port active=0 def="n" question
  if command -v ufw >/dev/null 2>&1; then
    ssh_port="$(detect_ssh_port)"
    if ufw status 2>/dev/null | grep -q '^Status: active'; then
      active=1
      def="y"
      question="Брандмауэр UFW включён. Открыть в нём порты Hooba?"
    else
      question="Включить брандмауэр UFW и открыть в нём только SSH (порт ${ssh_port}) и порты Hooba?"
    fi
    if prompt_yn "$question" "$def"; then
      step "Настройка UFW"
      ufw allow "${ssh_port}/tcp" >/dev/null
      ufw allow 80/tcp >/dev/null
      ufw allow 443/tcp >/dev/null
      ufw allow "${TURN_PORT}" >/dev/null
      ufw allow "${TURN_TLS_PORT}/tcp" >/dev/null
      ufw allow "${TURN_MIN_PORT}:${TURN_MAX_PORT}/udp" >/dev/null
      ufw allow "${MEDIASOUP_RTC_MIN_PORT}:${MEDIASOUP_RTC_MAX_PORT}/udp" >/dev/null
      ufw allow "${MEDIASOUP_RTC_MIN_PORT}:${MEDIASOUP_RTC_MAX_PORT}/tcp" >/dev/null
      if ((active == 0)); then
        ufw --force enable >/dev/null
      fi
      log_line "UFW: порты открыты (SSH — ${ssh_port}/tcp)."
    fi
  fi
  print_ports_reminder
}

# ---------------------------------------------------------------------------
# Сертификат Let's Encrypt
# ---------------------------------------------------------------------------

certbot_version() {
  certbot --version 2>/dev/null | awk '{ print $2 }'
}

# В apt Ubuntu 22.04/24.04 certbot старый, свежий — только в snap (так советует сам certbot).
install_certbot_snap() {
  if ! command -v snap >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
    log_line "Устанавливаю snapd (нужен для свежего certbot)."
    apt_install snapd
    snap wait system seed.loaded >/dev/null 2>&1 || true
  fi
  command -v snap >/dev/null 2>&1 || die "Нужен certbot ${CERTBOT_IP_MIN_VERSION}+, а snap не найден. Установите certbot вручную: https://certbot.eff.org"
  if command -v dpkg >/dev/null 2>&1 && dpkg -s certbot >/dev/null 2>&1; then
    log_line "Удаляю certbot из apt (snap-версия с ним конфликтует). Сертификаты в /etc/letsencrypt сохраняются."
    apt-get remove -y certbot
  fi
  log_line "Устанавливаю certbot из snap."
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/local/bin/certbot
  hash -r
}

ensure_certbot() {
  local min_version="${1:-}" v
  step "Проверка certbot" "  - есть ли у сервера интернет\n  - установите certbot вручную: https://certbot.eff.org"
  if command -v certbot >/dev/null 2>&1; then
    [[ -z "$min_version" ]] && return 0
    v="$(certbot_version)"
    version_ge "${v:-0}" "$min_version" && return 0
    log_line "certbot ${v:-?} слишком старый: для сертификата на IP нужен ${min_version}+."
    prompt_yn "Заменить certbot на актуальный из snap?" "y" || die "Без certbot ${min_version}+ сертификат на IP не выпустить."
    install_certbot_snap
  elif [[ -n "$min_version" ]]; then
    install_certbot_snap
  elif command -v apt-get >/dev/null 2>&1; then
    log_line "certbot не найден — устанавливаю."
    apt_install certbot
  else
    die "certbot не найден. Установите его вручную: https://certbot.eff.org"
  fi
  if [[ -n "$min_version" ]]; then
    v="$(certbot_version)"
    version_ge "${v:-0}" "$min_version" || die "certbot ${v:-?} после установки всё ещё старше ${min_version}."
  fi
}

# Домен должен указывать на этот сервер, иначе Let's Encrypt его не проверит.
check_domain_dns() {
  local domain="$1" ip="$2" resolved
  command -v getent >/dev/null 2>&1 || return 0
  resolved="$(getent ahostsv4 "$domain" 2>/dev/null | awk '{ print $1; exit }' || true)"
  if [[ -z "$resolved" ]]; then
    log_line "Домен ${domain} пока никуда не указывает (нет A-записи)."
  elif [[ "$ip" == "127.0.0.1" || "$resolved" == "$ip" ]]; then
    log_line "DNS: ${domain} → ${resolved} — OK."
    return 0
  else
    log_line "Домен ${domain} указывает на ${resolved}, а у этого сервера IP ${ip}."
  fi
  echo "  В панели, где куплен домен, создайте A-запись: ${domain} → ${ip}"
  echo "  Изменения DNS расходятся от нескольких минут до пары часов."
  prompt_yn "Продолжить, не дожидаясь DNS? (сертификат, скорее всего, не выпустится)" "n" \
    || die "Настройте A-запись и запустите hooba install снова — ответы придётся ввести заново, данные не пострадают."
}

# Первый аргумент — домен или публичный IPv4; каталог live/<он> одинаков в обоих случаях.
# Сертификат на IP живёт 6 дней: certbot.timer продлевает его сам, когда остаётся половина срока.
issue_tls_cert() {
  local host="$1" email="$2" hint
  local -a args=(certonly --standalone --non-interactive --agree-tos --keep-until-expiring)
  if [[ -n "$email" ]]; then
    args+=(--email "$email")
  else
    args+=(--register-unsafely-without-email)
  fi
  if is_ipv4 "$host"; then
    ensure_certbot "$CERTBOT_IP_MIN_VERSION"
    args+=(--preferred-profile shortlived --ip-address "$host")
  else
    ensure_certbot
    args+=(-d "$host")
  fi
  ensure_port_free 80
  hint="  - порт 80 (TCP) открыт для всего интернета, в том числе в брандмауэре панели хостинга"
  if ! is_ipv4 "$host"; then
    hint+="\n  - A-запись домена ${host} указывает на IP этого сервера (проверка: getent hosts ${host})"
  fi
  hint+="\n  - Let's Encrypt ограничивает попытки: после 5 неудач подряд подождите час\n  - текст ошибки certbot — выше, строки Detail / Hint"
  if [[ -f "$ENV_FILE" ]]; then
    hint+="\n  - вернуть сервер с прежними настройками: hooba start"
  fi
  step "Выпуск сертификата Let's Encrypt для ${host}" "$hint"
  certbot "${args[@]}"
  [[ -f "/etc/letsencrypt/live/${host}/fullchain.pem" ]] || die "certbot отработал, но сертификата для ${host} нет в /etc/letsencrypt/live/."
}

# coturn в образе работает от nobody:nogroup (65534), а /etc/letsencrypt/{live,archive} — 0700 root.
# Поэтому сертификат копируется в infra/docker/turn-tls с владельцем 65534 и монтируется в coturn.
TURN_TLS_REL="infra/docker/turn-tls"
TURN_TLS_UID=65534

# Печатает sh-команды копирования сертификата из каталога live/<домен> (первый аргумент).
turn_tls_copy_cmds() {
  local src="$1" dst="${REPO_ROOT}/${TURN_TLS_REL}"
  printf 'install -d -m 0700 -o %s -g %s %q\n' "$TURN_TLS_UID" "$TURN_TLS_UID" "$dst"
  printf 'install -m 0444 -o %s -g %s %s/fullchain.pem %q/fullchain.pem\n' "$TURN_TLS_UID" "$TURN_TLS_UID" "$src" "$dst"
  printf 'install -m 0400 -o %s -g %s %s/privkey.pem %q/privkey.pem\n' "$TURN_TLS_UID" "$TURN_TLS_UID" "$src" "$dst"
}

sync_turn_tls_certs() {
  local domain lineage
  domain="$(env_value PUBLIC_DOMAIN)"
  [[ -n "$domain" ]] || die "В ${ENV_REL} нет PUBLIC_DOMAIN — не знаю, какой сертификат отдать coturn."
  lineage="/etc/letsencrypt/live/${domain}"
  [[ -f "${lineage}/privkey.pem" ]] || die "Не найден сертификат ${lineage}. Выпустите его заново: hooba install"
  sh -c "$(turn_tls_copy_cmds "$(printf '%q' "$lineage")")"
  log_line "Сертификат для голоса (TURNS) скопирован в ${TURN_TLS_REL}/."
}

# Сертификат выпущен через --standalone: при продлении certbot сам слушает :80,
# а там уже контейнер nginx. Хуки освобождают порт и подхватывают новый сертификат.
# Каталоги renewal-hooks certbot выполняет при любом renew (certbot.timer).
write_renewal_hook() {
  local stage="$1" body="$2" path
  path="/etc/letsencrypt/renewal-hooks/${stage}/hooba.sh"
  mkdir -p "/etc/letsencrypt/renewal-hooks/${stage}"
  printf '#!/bin/sh\n# Hooba (install.sh): %s\nset -e\n%s\n' "$stage" "$body" >"$path"
  chmod 755 "$path"
}

install_renewal_hooks() {
  local domain compose_cmd
  domain="$(env_value PUBLIC_DOMAIN)"
  [[ -n "$domain" ]] || die "В ${ENV_REL} нет PUBLIC_DOMAIN — хуки продления не записаны."
  compose_cmd="$(printf 'cd %q && docker compose --env-file %q -f %q' "$REPO_ROOT" "$ENV_REL" "$COMPOSE_REL")"
  write_renewal_hook pre "${compose_cmd} stop web"
  write_renewal_hook post "${compose_cmd} start web"
  # deploy — только если сертификат реально обновился: coturn читает его один раз при старте.
  # RENEWED_LINEAGE certbot передаёт сам; чужие сертификаты на этой машине пропускаем.
  write_renewal_hook deploy "case \"\$RENEWED_LINEAGE\" in
  */live/${domain}) ;;
  *) exit 0 ;;
esac
$(turn_tls_copy_cmds '"$RENEWED_LINEAGE"')
${compose_cmd} restart coturn"
  log_line "Автопродление сертификата настроено (хуки в /etc/letsencrypt/renewal-hooks/)."
  check_renew_timer "$domain"
}

# Продлевает certbot.timer (apt) или snap.certbot.renew.timer (snap), оба — дважды в сутки.
check_renew_timer() {
  local host="$1" t
  if is_ipv4 "$host"; then
    log_line "Сертификат на IP живёт 6 дней и продлевается примерно раз в 3 дня; сайт при этом недоступен несколько секунд."
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    log_line "Предупреждение: systemctl не найден — проверьте, что certbot renew запускается по расписанию (cron)."
    return 0
  fi
  for t in snap.certbot.renew.timer certbot.timer; do
    if systemctl is-enabled "$t" >/dev/null 2>&1; then
      systemctl start "$t" >/dev/null 2>&1 || true
      log_line "Автопродление: таймер ${t} включён."
      return 0
    fi
  done
  log_line "ВНИМАНИЕ: таймер продления certbot не найден — сертификат истечёт и сайт перестанет открываться."
  log_line "Добавьте в cron (crontab -e): 0 */12 * * * certbot renew -q"
}

# Сколько дней осталось сертификату; печатает предупреждение, если продление, похоже, не работает.
cert_status() {
  local host="$1" f end days limit=20
  f="/etc/letsencrypt/live/${host}/fullchain.pem"
  if [[ ! -f "$f" ]]; then
    log_line "Сертификат: не найден (${f}). Выпустить заново: hooba install"
    return 0
  fi
  command -v openssl >/dev/null 2>&1 || return 0
  end="$(openssl x509 -enddate -noout -in "$f" | cut -d= -f2)"
  days=$((($(date -d "$end" +%s) - $(date +%s)) / 86400))
  is_ipv4 "$host" && limit=2
  if ((days < 0)); then
    log_line "Сертификат: ИСТЁК. Проверьте продление: certbot renew --dry-run, затем hooba repair"
  elif ((days < limit)); then
    log_line "Сертификат: осталось ${days} дн. — похоже, продление не срабатывает. Проверьте: certbot renew --dry-run"
  else
    log_line "Сертификат: действует ещё ${days} дн."
  fi
}

# ---------------------------------------------------------------------------
# Настройки (.env.prod)
# ---------------------------------------------------------------------------

# Спрашивает квоту, результат — в UPLOADS_MAX_BYTES. Аргумент — текущее значение в байтах.
prompt_uploads_quota() {
  local current="${1:-}" free def answer bytes
  free="$(docker_free_bytes)"
  if [[ -n "$free" ]]; then
    log_line "Свободно на диске: ~$(fmt_gib "$free") ГиБ."
  fi
  def="$UPLOADS_DEFAULT_GIB"
  if [[ -n "$current" ]]; then def="$(fmt_gib "$current")"; fi
  echo "Картинки чата хранятся на диске сервера. Когда квота заполнится на 80%, самые старые удаляются автоматически."
  while true; do
    prompt_default answer "Сколько ГиБ отдать под картинки (минимум 0.1)" "$def"
    bytes="$(gib_to_bytes "$answer")"
    if [[ -z "$bytes" ]]; then
      echo "Нужно число ГиБ, не меньше 0.1 (например 5 или 0.5)."
      continue
    fi
    # Backend отклоняет загрузки, когда свободно меньше UPLOADS_MIN_FREE_BYTES (1 ГиБ по умолчанию).
    if [[ -n "$free" ]] && ((bytes + GIB > free)); then
      log_line "Квота $(fmt_gib "$bytes") ГиБ + 1 ГиБ запаса больше свободного места (уже загруженные картинки не учтены) — загрузки могут остановиться раньше, чем сработает квота."
      prompt_yn "Оставить $(fmt_gib "$bytes") ГиБ?" "n" || continue
    fi
    UPLOADS_MAX_BYTES="$bytes"
    return 0
  done
}

# Старый .env.prod не содержит секретов coturn REST и bootstrap. Без TURN_AUTH_SECRET
# контейнер coturn не стартует. Уже заданные значения не перезаписываются.
ensure_prod_secrets() {
  [[ -f "$ENV_FILE" ]] || return 0
  if [[ -z "$(env_value TURN_AUTH_SECRET)" ]]; then
    printf '\n# Секрет coturn --static-auth-secret. Backend выдаёт короткоживущие учётные данные.\nTURN_AUTH_SECRET=%s\n' "$(rand_hex 32)" >>"$ENV_FILE"
    log_line "В ${ENV_REL} добавлен TURN_AUTH_SECRET."
  fi
  if [[ -z "$(env_value SETUP_TOKEN)" ]]; then
    printf '\n# Поле setup_token на странице /setup. Нужен только до первого владельца.\nSETUP_TOKEN=%s\n' "$(rand_hex 24)" >>"$ENV_FILE"
    log_line "В ${ENV_REL} добавлен SETUP_TOKEN."
  fi
  # Старые установки: bind на публичный IP внутри контейнера невозможен — голос без домена не поднимался.
  if [[ "$(env_value MEDIASOUP_BIND_TO_ANNOUNCED)" == "1" ]]; then
    set_env_value MEDIASOUP_BIND_TO_ANNOUNCED 0
    log_line "В ${ENV_REL} выключен MEDIASOUP_BIND_TO_ANNOUNCED (мешал голосу на сервере без домена)."
  fi
  chmod 600 "$ENV_FILE"
}

# Секрет из текущего .env.prod или новый. Пароль Postgres менять нельзя: база в томе
# создана со старым и новый не примет — backend перестанет запускаться.
keep_or_new_secret() {
  local v
  v="$(env_value "$1")"
  if [[ -n "$v" ]]; then printf '%s' "$v"; else rand_hex "$2"; fi
}

write_env_prod() {
  local public_domain="$1" turn_ext_ip="$2" owner_email="$3"
  local pg_pass jwt setup_token turn_secret
  pg_pass="$(keep_or_new_secret POSTGRES_PASSWORD 24)"
  jwt="$(keep_or_new_secret JWT_SECRET 32)"
  setup_token="$(keep_or_new_secret SETUP_TOKEN 24)"
  turn_secret="$(keep_or_new_secret TURN_AUTH_SECRET 32)"

  local origin="https://${public_domain}"
  local h="$public_domain"
  local ice_json
  ice_json="$(printf '[{"urls":["stun:%s:%s"]},{"urls":["turn:%s:%s?transport=udp","turns:%s:%s?transport=tcp"]}]' \
    "$h" "$TURN_PORT" "$h" "$TURN_PORT" "$h" "$TURN_TLS_PORT")"

  if [[ -f "$ENV_FILE" ]]; then
    mkdir -p "$BACKUP_DIR"
    install -m 600 "$ENV_FILE" "${BACKUP_DIR}/env-$(date +%Y%m%d-%H%M%S).before-install"
  fi
  (
    umask 077
    cat >"$ENV_FILE" <<EOF
# Сгенерировано install.sh — не публикуйте и не удаляйте: без этого файла база не откроется.
POSTGRES_PASSWORD=${pg_pass}
JWT_SECRET=${jwt}
SETUP_TOKEN=${setup_token}
PUBLIC_DOMAIN=${public_domain}
FRONTEND_ORIGIN=${origin},app://hooba
HTTP_PORT=80
HTTPS_PORT=443
NGINX_TLS_CERT=/etc/letsencrypt/live/${public_domain}/fullchain.pem
NGINX_TLS_KEY=/etc/letsencrypt/live/${public_domain}/privkey.pem

MEDIASOUP_ANNOUNCED_IP=${public_domain}
MEDIASOUP_BIND_TO_ANNOUNCED=0
MEDIASOUP_RTC_MIN_PORT=${MEDIASOUP_RTC_MIN_PORT}
MEDIASOUP_RTC_MAX_PORT=${MEDIASOUP_RTC_MAX_PORT}
MEDIASOUP_WEBRTC_PORT=${MEDIASOUP_RTC_MIN_PORT}

TURN_EXTERNAL_IP=${turn_ext_ip}
TURN_REALM=${public_domain}
TURN_AUTH_SECRET=${turn_secret}
TURN_PORT=${TURN_PORT}
TURN_MIN_PORT=${TURN_MIN_PORT}
TURN_MAX_PORT=${TURN_MAX_PORT}
TURN_TLS_ENABLED=1
TURN_TLS_PORT=${TURN_TLS_PORT}

RTC_ICE_SERVERS_JSON=${ice_json}

# Квота картинок чата в байтах (hooba uploads-quota): при 80% старые удаляются до 70%.
UPLOADS_MAX_BYTES=${UPLOADS_MAX_BYTES:-$((UPLOADS_DEFAULT_GIB * GIB))}
EOF
  )
  chmod 600 "$ENV_FILE"

  local summary="${LOG_DIR}/owner-summary.txt"
  (
    umask 077
    cat >"$summary" <<EOF
Hooba — сводка установки
Время: $(date '+%F %T')
Адрес сервера: ${origin}
Первичная настройка: ${origin}/setup
Токен настройки (поле «Токен настройки» на /setup): ${setup_token}
Email Let's Encrypt: ${owner_email:-не указан}
Квота картинок чата: $(fmt_gib "${UPLOADS_MAX_BYTES:-$((UPLOADS_DEFAULT_GIB * GIB))}") ГиБ (изменить: hooba uploads-quota)
Все пароли: ${ENV_FILE}
Никому не показывайте этот файл и ${ENV_REL}. Сохраните копию ${ENV_REL} у себя:
без него резервную копию базы на новом сервере не открыть.
EOF
  )
  log_line "Настройки записаны в ${ENV_REL}, сводка — в logs/owner-summary.txt."
}

# Тома прежней установки при отсутствующем .env.prod: пароль базы потерян.
check_orphan_volumes() {
  [[ -f "$ENV_FILE" ]] && return 0
  docker volume ls -q 2>/dev/null | grep -q 'pgdata_prod$' || return 0
  local latest
  latest="$(ls -1t "$BACKUP_DIR"/env-*.copy "$BACKUP_DIR"/env-*.before-install 2>/dev/null | head -n1 || true)"
  log_line "Найдена база прежней установки, но нет файла ${ENV_REL} с её паролем."
  if [[ -n "$latest" ]] && prompt_yn "Восстановить настройки из ${latest#"$REPO_ROOT"/}? Рекомендуется" "y"; then
    install -m 600 "$latest" "$ENV_FILE"
    log_line "Настройки восстановлены — пароль базы прежний."
    return 0
  fi
  echo "  Без прежнего пароля backend не сможет открыть базу. Варианты:"
  echo "  - положите сохранённую копию .env.prod в ${ENV_REL} и запустите install снова;"
  echo "  - или удалите старые данные (необратимо): docker volume rm \$(docker volume ls -q | grep pgdata_prod)"
  prompt_yn "Продолжить всё равно?" "n" || die "Отменено."
}

# ---------------------------------------------------------------------------
# Запуск и проверка
# ---------------------------------------------------------------------------

enable_docker_boot() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable docker >/dev/null 2>&1 || log_line "Предупреждение: не удалось включить автозапуск docker."
    systemctl enable containerd >/dev/null 2>&1 || true
  fi
}

apply_restart_policy() {
  local ids
  ids="$(compose ps -q 2>/dev/null || true)"
  [[ -n "${ids// }" ]] || return 0
  # В compose уже задано restart: unless-stopped; docker update фиксирует policy и для существующих контейнеров.
  # shellcheck disable=SC2086
  docker update --restart unless-stopped $ids >/dev/null || log_line "Предупреждение: не удалось включить автоперезапуск контейнеров."
}

BUILD_HINT="  - хватает ли места: df -h (нужно хотя бы 5 ГиБ)\n  - хватает ли памяти: free -h (при < 2 ГиБ нужен swap — install предложит его создать)\n  - есть ли интернет: сборка скачивает зависимости"

start_stack() {
  local build="${1:-0}"
  enable_docker_boot
  if [[ "$build" == "1" ]]; then
    step "Сборка и запуск (первый раз — 5–15 минут)" "$BUILD_HINT"
    compose up -d --build
  else
    step "Запуск контейнеров" "  - не заняты ли порты другой программой: ss -tlnp | grep -E ':(80|443|${TURN_PORT}) '\n  - работает ли docker: systemctl status docker"
    compose up -d
  fi
  apply_restart_policy
}

# Ждёт /ready backend. Аргумент — число попыток по 5 секунд.
wait_backend_ready() {
  local tries="${1:-24}" i
  for ((i = 0; i < tries; i++)); do
    if compose exec -T backend node -e \
      "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    ((i + 1 < tries)) && sleep 5
  done
  return 1
}

show_diagnostics() {
  echo
  echo "--- Состояние контейнеров ---"
  compose ps -a || true
  echo "--- Последние строки журнала backend ---"
  compose logs --no-color --tail=40 backend 2>&1 || true
  echo
  if compose logs --no-color --tail=200 backend 2>&1 | grep -q 'password authentication failed'; then
    log_line "Причина: пароль базы в ${ENV_REL} не совпадает с паролем, с которым база создавалась."
    echo "  Верните прежний файл настроек из ${BACKUP_DIR} (env-*.copy или env-*.before-install) в ${ENV_FILE}"
    echo "  и выполните hooba repair."
  fi
}

# Проверка после запуска. При неудаче — диагностика и подсказки, затем выход с ошибкой
# (кроме случая, когда вызывающему нужен код возврата: health_validate soft).
health_validate() {
  local mode="${1:-}" host
  step "Проверка, что сервер отвечает"
  log_line "Жду готовности backend (до 2 минут: при первом запуске создаётся база)…"
  if ! wait_backend_ready 24; then
    show_diagnostics
    [[ "$mode" == "soft" ]] && return 1
    die "Backend не запустился. Журнал: hooba logs backend. Перезапуск всего: hooba repair"
  fi
  log_line "Backend отвечает."
  if curl -kfsS --max-time 5 "https://127.0.0.1/" >/dev/null 2>&1; then
    log_line "Веб-версия отвечает по HTTPS."
  else
    log_line "Предупреждение: веб-версия не ответила по HTTPS. Журнал: hooba logs web"
  fi
  host="$(env_value PUBLIC_DOMAIN)"
  # Проверка «как снаружи»: сертификат действителен для адреса. Некоторые хостинги не пускают
  # сервер к собственному внешнему IP — тогда это только предупреждение.
  if [[ -n "$host" ]] && ! curl -fsS --max-time 8 -o /dev/null "https://${host}/" 2>/dev/null; then
    log_line "Предупреждение: https://${host}/ не открылся с самого сервера. Проверьте с компьютера в браузере;"
    log_line "если не открывается — откройте порты в брандмауэре хостинга (список: hooba help)."
  fi
  return 0
}

print_finish() {
  local origin="$1" token="$2"
  cat <<EOF

======================================================================
  Hooba установлен!

  1. Откройте в браузере:   ${origin}/setup
  2. Введите токен настройки:
       ${token}
  3. Создайте аккаунт владельца и сообщество.

  Токен и пароли сохранены в ${LOG_DIR}/owner-summary.txt — никому их не показывайте.
  Скачайте себе копию ${ENV_FILE}: без неё резервную копию базы не восстановить.

  Управление сервером — команда hooba из любой папки:
    hooba           — меню: выберите действие по номеру
    hooba status    — всё ли в порядке
    hooba update    — обновить Hooba до новой версии
    hooba repair    — если что-то перестало работать
    hooba logs      — журнал (поможет найти причину проблемы)
    hooba backup    — резервная копия
    hooba help      — все команды
======================================================================
EOF
}

# ---------------------------------------------------------------------------
# Резервные копии
# ---------------------------------------------------------------------------

LAST_DUMP=""

backup_db() {
  local name="$1" out tmp
  out="${BACKUP_DIR}/${name}.sql.gz"
  tmp="${out}.part"
  mkdir -p "$BACKUP_DIR"
  step "Резервная копия базы данных" "  - запущен ли сервер: hooba status\n  - хватает ли места на диске: df -h"
  compose exec -T postgres pg_dump -U postgres north_star | gzip >"$tmp"
  mv "$tmp" "$out"
  chmod 600 "$out"
  LAST_DUMP="$out"
  log_line "База → ${out#"$REPO_ROOT"/} ($(du -h "$out" | cut -f1))."
}

# Архив тома картинок чата (uploads_prod). Пишется через tar внутри backend: том принадлежит его пользователю.
# Неудача не отменяет уже готовый дамп БД — только предупреждение.
backup_uploads() {
  local ts="$1" out tmp
  out="${BACKUP_DIR}/uploads-${ts}.tar.gz"
  tmp="${out}.part"
  log_line "Картинки чата → ${out#"$REPO_ROOT"/}"
  if compose exec -T backend tar -czf - -C /data uploads >"$tmp"; then
    mv "$tmp" "$out"
    chmod 600 "$out"
  else
    rm -f "$tmp"
    log_line "ВНИМАНИЕ: архив картинок не создан (backend не запущен?). Копия базы при этом готова."
  fi
}

require_postgres_running() {
  compose ps --status running -q postgres 2>/dev/null | grep -q . \
    || die "База данных не запущена — сначала запустите сервер: hooba start"
}

# Автокопии (cron) хранятся последние AUTO_BACKUP_KEEP; ручные не удаляются никогда.
prune_auto_backups() {
  local f
  { ls -1t "$BACKUP_DIR"/north_star-auto-*.sql.gz 2>/dev/null || true; } | tail -n +$((AUTO_BACKUP_KEEP + 1)) | while read -r f; do
    rm -f "$f"
  done
}

setup_auto_backup() {
  [[ -d /etc/cron.d ]] || return 0
  if [[ -f "$CRON_BACKUP_FILE" ]]; then
    log_line "Ежедневная резервная копия базы уже настроена."
    return 0
  fi
  prompt_yn "Делать резервную копию базы каждую ночь (хранятся ${AUTO_BACKUP_KEEP} последних)? Рекомендуется" "y" || return 0
  printf '# Hooba (install.sh): ночная копия базы\n30 3 * * * root %q backup --auto >/dev/null 2>&1\n' "${REPO_ROOT}/install.sh" >"$CRON_BACKUP_FILE"
  chmod 644 "$CRON_BACKUP_FILE"
  log_line "Ночная копия базы настроена (03:30, папка backups/). Отключить: rm ${CRON_BACKUP_FILE}"
}

restore_db() {
  local dump="$1" i
  step "Восстановление базы из ${dump##*/}" "  - цел ли файл: gunzip -t ${dump}\n  - журнал базы: hooba logs postgres"
  compose up -d postgres
  for ((i = 0; i < 30; i++)); do
    compose exec -T postgres pg_isready -U postgres -q && break
    sleep 2
  done
  compose stop backend
  compose exec -T postgres psql -U postgres -q -v ON_ERROR_STOP=1 \
    -c 'DROP DATABASE IF EXISTS north_star WITH (FORCE);' \
    -c 'CREATE DATABASE north_star;'
  gunzip -c "$dump" | compose exec -T postgres psql -U postgres -q -v ON_ERROR_STOP=1 -d north_star >/dev/null
  log_line "База восстановлена."
}

restore_uploads() {
  local archive="$1"
  step "Восстановление картинок из ${archive##*/}" "  - цел ли архив: gzip -t ${archive}\n  - хватает ли места на диске: df -h\n  - база к этому моменту уже восстановлена"
  compose run --rm --no-deps -T backend sh -c 'find /data/uploads -mindepth 1 -delete && tar -xzf - -C /data' <"$archive"
  log_line "Картинки восстановлены."
}

# ---------------------------------------------------------------------------
# Команды
# ---------------------------------------------------------------------------

cmd_install() {
  start_log install
  require_repo
  mkdir -p "$BACKUP_DIR"

  if [[ -f "$ENV_FILE" ]]; then
    echo "Hooba на этом сервере уже установлен."
    echo "Переустановка заново спросит адрес, сертификат и квоту. Пароли, база и картинки сохранятся."
    prompt_yn "Переустановить?" "n" || die "Отменено. Обновление версии — hooba update, починка — hooba repair."
    step "Остановка текущего сервера"
    compose down || true
  else
    check_orphan_volumes
  fi

  preflight

  local suggested old_host public_domain="" owner_email turn_ip address_mode def_mode="1"
  suggested="$(detect_public_ip)"
  [[ -n "$suggested" ]] || suggested="127.0.0.1"
  old_host="$(env_value PUBLIC_DOMAIN)"
  if [[ -n "$old_host" ]] && is_ipv4 "$old_host"; then def_mode="2"; fi

  echo
  echo "Как участники будут открывать сервер:"
  echo "  1) по домену, например chat.example.com (домен нужно купить и направить A-запись на этот сервер)"
  echo "  2) по IP-адресу ${suggested}, без домена (проще; сертификат продлевается автоматически)"
  while true; do
    prompt_default address_mode "Выберите 1 или 2" "$def_mode"
    [[ "$address_mode" == "1" || "$address_mode" == "2" ]] && break
    echo "Введите 1 или 2."
  done

  if [[ "$address_mode" == "1" ]]; then
    local def_domain="chat.example.com"
    if [[ -n "$old_host" ]] && ! is_ipv4 "$old_host"; then def_domain="$old_host"; fi
    while true; do
      prompt_default public_domain "Домен (без https://)" "$def_domain"
      public_domain="${public_domain#https://}"
      public_domain="${public_domain#http://}"
      public_domain="${public_domain%%/*}"
      if is_ipv4 "$public_domain"; then
        echo "Это IP-адрес. Для работы без домена перезапустите установку и выберите вариант 2."
      elif [[ "$public_domain" == "chat.example.com" ]] || ! validate_domain "$public_domain"; then
        echo "Нужен ваш настоящий домен, например chat.mysite.ru."
      else
        break
      fi
    done
    prompt_default owner_email "Email для писем Let's Encrypt (можно оставить пустым)" ""
    turn_ip="$suggested"
    if ! is_public_ipv4 "$turn_ip"; then
      prompt_default turn_ip "Не удалось определить внешний IP сервера. Введите его (есть в панели хостинга)" ""
      is_public_ipv4 "$turn_ip" || die "Нужен публичный IPv4 сервера — без него не заработает голос."
    fi
    check_domain_dns "$public_domain" "$turn_ip"
  else
    while true; do
      prompt_default public_domain "Внешний IPv4 этого сервера (есть в панели хостинга)" "$suggested"
      is_public_ipv4 "$public_domain" && break
      echo "Нужен внешний (публичный) IPv4. Адреса 10.x, 192.168.x, 172.16–31.x, 127.x — внутренние, они не подойдут."
    done
    if [[ "$suggested" != "127.0.0.1" && "$suggested" != "$public_domain" ]]; then
      log_line "Предупреждение: сервер выходит в интернет с IP ${suggested}, а указан ${public_domain}. Убедитесь, что адрес верный."
    fi
    prompt_default owner_email "Email для писем Let's Encrypt (можно оставить пустым)" ""
    turn_ip="$public_domain"
  fi

  echo
  prompt_uploads_quota "$(env_value UPLOADS_MAX_BYTES)"

  ensure_port_free 443
  ensure_port_free "$TURN_PORT"

  issue_tls_cert "$public_domain" "$owner_email"
  step "Запись настроек"
  write_env_prod "$public_domain" "$turn_ip" "$owner_email"
  sync_turn_tls_certs
  install_renewal_hooks
  setup_firewall
  setup_auto_backup

  start_stack 1
  health_validate

  print_finish "https://${public_domain}" "$(env_value SETUP_TOKEN)"
}

cmd_start() {
  start_log start
  require_repo
  require_env
  ensure_prod_secrets
  start_stack 0
  health_validate
  log_line "Сервер запущен и будет сам стартовать после перезагрузки."
}

cmd_stop() {
  start_log stop
  require_repo
  require_env
  step "Остановка сервера"
  compose stop
  log_line "Сервер остановлен. Запустить снова: hooba start"
}

cmd_status() {
  start_log status
  require_repo
  require_env
  local host free quota last
  host="$(env_value PUBLIC_DOMAIN)"
  log_line "Адрес: https://${host}"
  if [[ -d "$REPO_ROOT/.git" ]]; then
    log_line "Версия: $(repo_git log -1 --format='%h от %cd' --date=short 2>/dev/null || echo '?')"
  fi
  echo
  compose ps -a
  echo
  if wait_backend_ready 1; then
    log_line "Backend: отвечает."
  else
    log_line "Backend: НЕ отвечает. Журнал: hooba logs backend; починка: hooba repair"
  fi
  cert_status "$host"
  check_renew_timer "$host"
  free="$(docker_free_bytes)"
  quota="$(env_value UPLOADS_MAX_BYTES)"
  [[ -n "$free" ]] && log_line "Свободно на диске: ~$(fmt_gib "$free") ГиБ."
  [[ -n "$quota" ]] && log_line "Квота картинок: $(fmt_gib "$quota") ГиБ."
  last="$(ls -1t "$BACKUP_DIR"/north_star-*.sql.gz 2>/dev/null | head -n1 || true)"
  if [[ -n "$last" ]]; then
    log_line "Последняя копия базы: ${last#"$REPO_ROOT"/}"
  else
    log_line "Резервных копий базы нет. Сделать: hooba backup"
  fi
  if [[ ! -f "$CRON_BACKUP_FILE" ]]; then
    log_line "Ночные копии базы не настроены (включаются при hooba install)."
  fi
}

cmd_validate() {
  start_log validate
  require_repo
  require_env
  health_validate
  log_line "Проверка пройдена."
}

cmd_logs() {
  require_repo
  require_env
  if [[ -n "${1:-}" ]] && [[ ! "$1" =~ ^(backend|web|postgres|coturn)$ ]]; then
    die "Нет такого сервиса: $1. Есть: backend, web, postgres, coturn."
  fi
  echo "Журнал Hooba (последние 200 строк и дальше в реальном времени). Выход — Ctrl+C."
  trap - ERR
  compose logs --tail=200 -f ${1:+"$1"} || true
}

# Откатить можно только git-версию, поэтому вместе с ней запоминается копия базы:
# новая версия могла применить миграции, со старой схемой старый код не стартует.
save_update_state() {
  local rev="$1" branch="$2" dump="$3"
  printf 'REV=%s\nBRANCH=%s\nDUMP=%s\n' "$rev" "$branch" "$dump" >"$UPDATE_STATE"
  chmod 600 "$UPDATE_STATE"
}

state_value() {
  grep -E "^$1=" "$UPDATE_STATE" 2>/dev/null | tail -n1 | cut -d= -f2- || true
}

cmd_update() {
  start_log update
  require_repo
  require_env
  local old_rev="" new_rev="" branch="" dump=""

  require_postgres_running
  backup_db "north_star-$(date +%Y%m%d-%H%M%S)-before-update"
  dump="$LAST_DUMP"

  if [[ -d "$REPO_ROOT/.git" ]]; then
    old_rev="$(repo_git rev-parse HEAD)"
    branch="$(repo_git symbolic-ref -q --short HEAD || true)"
    if [[ -z "$branch" ]]; then
      # После rollback репозиторий стоит на конкретной версии — возвращаемся на ветку.
      branch="$(state_value BRANCH)"
      branch="${branch:-main}"
      repo_git checkout -q "$branch"
    fi
    step "Загрузка новой версии" "  - есть ли у сервера интернет: curl -I https://github.com\n  - не изменены ли файлы вручную: git -C ${REPO_ROOT} status (вернуть как было: git -C ${REPO_ROOT} checkout -- .)"
    if ! repo_git pull --ff-only; then
      echo
      repo_git status --short || true
      die "Не удалось загрузить обновление. Если выше перечислены файлы — это ручные правки, они мешают обновлению. Верните их (git -C ${REPO_ROOT} checkout -- .) и запустите hooba update снова."
    fi
    new_rev="$(repo_git rev-parse HEAD)"
    if [[ "$new_rev" == "$old_rev" ]]; then
      log_line "Новой версии нет (${old_rev:0:7}) — пересобираю текущую."
    else
      log_line "Версия: ${old_rev:0:7} → ${new_rev:0:7}"
      save_update_state "$old_rev" "$branch" "$dump"
    fi
  else
    log_line "Папка скачана без git — обновить код скрипт не может, только пересобрать текущий."
  fi

  ensure_prod_secrets
  if [[ -d "/etc/letsencrypt/live/$(env_value PUBLIC_DOMAIN)" ]]; then
    sync_turn_tls_certs
    install_renewal_hooks
  fi
  step "Сборка новой версии (5–15 минут)" "$BUILD_HINT"
  compose build --pull || compose build
  start_stack 0
  if ! health_validate soft; then
    if [[ -n "$old_rev" && "$new_rev" != "$old_rev" ]]; then
      echo "Новая версия не запустилась. Вернуть предыдущую (вместе с базой на момент обновления):"
      echo "  hooba rollback"
    fi
    die "Обновление не удалось."
  fi
  log_line "Обновление завершено."
}

cmd_rollback() {
  start_log rollback
  require_repo
  require_env
  [[ -d "$REPO_ROOT/.git" ]] || die "Папка без git — откат версии невозможен."
  [[ -f "$UPDATE_STATE" ]] || die "Нет сведений о прошлом обновлении — откатывать не к чему."
  local rev dump
  rev="$(state_value REV)"
  dump="$(state_value DUMP)"
  [[ -n "$rev" ]] || die "Повреждён ${UPDATE_STATE#"$REPO_ROOT"/}."
  echo "Будет возвращена версия ${rev:0:7}."
  if [[ -f "$dump" ]]; then
    echo "База будет восстановлена из ${dump#"$REPO_ROOT"/} — сообщения и изменения после обновления пропадут."
  else
    echo "Копии базы на момент обновления нет: если обновление меняло базу, старая версия может не запуститься."
  fi
  prompt_yn "Откатить?" "n" || die "Отменено."
  require_postgres_running
  backup_db "north_star-$(date +%Y%m%d-%H%M%S)-before-rollback"
  step "Возврат версии ${rev:0:7}"
  repo_git checkout -q "$rev"
  if [[ -f "$dump" ]]; then
    restore_db "$dump"
  fi
  step "Сборка предыдущей версии" "$BUILD_HINT"
  compose build
  start_stack 0
  health_validate
  rm -f "$UPDATE_STATE"
  log_line "Откат выполнен. Когда выйдет исправление, обновитесь как обычно: hooba update"
}

cmd_repair() {
  start_log repair
  require_repo
  require_env
  ensure_prod_secrets
  if [[ -d "/etc/letsencrypt/live/$(env_value PUBLIC_DOMAIN)" ]]; then
    sync_turn_tls_certs
  fi
  step "Пересоздание всех контейнеров (данные не трогаются)" "$BUILD_HINT"
  compose up -d --force-recreate
  apply_restart_policy
  health_validate
  log_line "Починка завершена."
}

cmd_backup() {
  local with_uploads=1 auto=0 arg ts
  for arg in "$@"; do
    case "$arg" in
      --no-uploads) with_uploads=0 ;;
      --auto) auto=1 with_uploads=0 ;;
      "") ;;
      *) die "Неизвестный параметр: ${arg}" ;;
    esac
  done
  start_log backup
  require_repo
  require_env
  require_postgres_running
  ts="$(date +%Y%m%d-%H%M%S)"
  if ((auto)); then
    backup_db "north_star-auto-${ts}"
    prune_auto_backups
  else
    backup_db "north_star-${ts}"
  fi
  install -m 600 "$ENV_FILE" "${BACKUP_DIR}/env-${ts}.copy"
  if ((with_uploads)); then
    backup_uploads "$ts"
  fi
  log_line "Резервная копия готова: папка backups/."
  if ((auto == 0)); then
    echo "Копии лежат на этом же сервере. Если сервер сломается, пропадут и они —"
    echo "время от времени скачивайте папку backups/ к себе (например: scp -r root@<сервер>:${BACKUP_DIR} .)"
  fi
}

cmd_restore() {
  local dump="${1:-}" uploads="${2:-}" ts
  start_log restore
  require_repo
  require_env
  if [[ -z "$dump" ]]; then
    dump="$(ls -1t "$BACKUP_DIR"/north_star-*.sql.gz 2>/dev/null | head -n1 || true)"
    [[ -n "$dump" ]] || die "В backups/ нет копий базы. Укажите файл: hooba restore <файл.sql.gz> [картинки.tar.gz]"
    log_line "Самая свежая копия: ${dump#"$REPO_ROOT"/}"
  fi
  [[ -f "$dump" ]] || die "Файл не найден: ${dump}. Список копий: ls ${BACKUP_DIR}"
  if [[ -z "$uploads" ]]; then
    ts="$(basename "$dump" | grep -oE '[0-9]{8}-[0-9]{6}' || true)"
    if [[ -n "$ts" && -f "${BACKUP_DIR}/uploads-${ts}.tar.gz" ]] \
      && prompt_yn "Восстановить и картинки из uploads-${ts}.tar.gz?" "y"; then
      uploads="${BACKUP_DIR}/uploads-${ts}.tar.gz"
    fi
  fi
  [[ -z "$uploads" || -f "$uploads" ]] || die "Файл не найден: ${uploads}"
  echo "Текущая база$([[ -n "$uploads" ]] && echo " и картинки") будут ЗАМЕНЕНЫ содержимым копии."
  prompt_yn "Восстановить из ${dump##*/}?" "n" || die "Отменено."
  require_postgres_running
  log_line "Сначала сохраняю текущее состояние — на случай, если выбрана не та копия."
  backup_db "north_star-$(date +%Y%m%d-%H%M%S)-before-restore"
  restore_db "$dump"
  if [[ -n "$uploads" ]]; then
    restore_uploads "$uploads"
  fi
  start_stack 0
  health_validate
  log_line "Восстановление завершено."
}

# Квота картинок после установки: аргумент — ГиБ, без аргумента — спросить.
# Backend читает UPLOADS_MAX_BYTES при старте, поэтому контейнер пересоздаётся.
cmd_uploads_quota() {
  start_log uploads-quota
  require_repo
  require_env
  local current
  current="$(env_value UPLOADS_MAX_BYTES)"
  [[ -n "$current" ]] || current="$((UPLOADS_DEFAULT_GIB * GIB))"
  log_line "Текущая квота картинок: $(fmt_gib "$current") ГиБ."
  if [[ -n "${1:-}" ]]; then
    UPLOADS_MAX_BYTES="$(gib_to_bytes "$1")"
    [[ -n "$UPLOADS_MAX_BYTES" ]] || die "Нужно число ГиБ, не меньше 0.1 (например 5 или 0.5)."
  else
    prompt_uploads_quota "$current"
  fi
  set_env_value UPLOADS_MAX_BYTES "$UPLOADS_MAX_BYTES"
  step "Перезапуск backend с новой квотой"
  compose up -d backend
  log_line "Квота: $(fmt_gib "$UPLOADS_MAX_BYTES") ГиБ."
  if ((UPLOADS_MAX_BYTES < current)); then
    log_line "Квота уменьшена: лишние старые картинки удалятся автоматически при ближайшей проверке."
  fi
}

cmd_cert_hooks() {
  start_log cert-hooks
  require_repo
  require_env
  sync_turn_tls_certs
  install_renewal_hooks
  log_line "Проверить продление: certbot renew --dry-run"
}

# Пункты меню: «группа|команда|что делает». Группа пишется только у первого пункта группы.
menu_entries() {
  if [[ ! -f "$ENV_FILE" ]]; then
    printf '%s\n' "Hooba ещё не установлен|install|Установить Hooba на этот сервер (пошаговые вопросы)"
    return 0
  fi
  printf '%s\n' \
    "Работа сервера|status|Статус: всё ли в порядке" \
    "|start|Запустить сервер" \
    "|stop|Остановить сервер" \
    "|repair|Починить: перезапустить всё заново (данные не трогаются)" \
    "Обновление|update|Обновить Hooba до новой версии" \
    "|rollback|Откатить последнее обновление" \
    "Журналы и проверка|logs|Журнал сервера (выход — Ctrl+C)" \
    "|validate|Проверить, что сервер отвечает" \
    "Резервные копии|backup|Сделать резервную копию" \
    "|restore|Восстановить из копии" \
    "Настройки|uploads-quota|Место под картинки чата" \
    "|install|Сменить адрес сервера или переустановить" \
    "|cert-hooks|Заново настроить продление сертификата"
}

# Пункт меню — отдельным процессом: его die/exit не закрывает меню,
# а Ctrl+C в журнале останавливает только журнал.
menu_run() {
  local cmd="$1" svc="" _
  local -a args=("$cmd")
  if [[ "$cmd" == "logs" ]]; then
    echo "Сервисы: backend — сервер, web — сайт, postgres — база, coturn — голос."
    read -r -p "Чей журнал показать (Enter — всех сразу): " svc || true
    svc="${svc// /}"
    [[ -n "$svc" ]] && args+=("$svc")
  fi
  echo
  trap ':' INT
  bash "${REPO_ROOT}/install.sh" "${args[@]}" || true
  trap - INT
  echo
  read -r -p "Нажмите Enter, чтобы вернуться в меню… " _ || true
}

cmd_menu() {
  local -a cmds=()
  local group cmd label choice host
  while true; do
    cmds=()
    host="$(env_value PUBLIC_DOMAIN)"
    echo
    echo "======================================================================"
    echo "  Hooba — управление сервером${host:+ https://${host}}"
    echo "======================================================================"
    while IFS='|' read -r group cmd label; do
      [[ -n "$group" ]] && printf '\n  %s\n' "$group"
      cmds+=("$cmd")
      printf '  %3s) %s\n' "${#cmds[@]}" "$label"
    done < <(menu_entries)
    printf '\n  %3s) %s\n\n' 0 "Выход"
    read -r -p "Введите номер и нажмите Enter: " choice || { echo; return 0; }
    choice="${choice// /}"
    [[ "$choice" == "0" || "$choice" == "q" ]] && return 0
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || ((10#$choice < 1 || 10#$choice > ${#cmds[@]})); then
      echo "Нет такого пункта — введите номер из списка (0 — выход)."
      continue
    fi
    menu_run "${cmds[10#$choice - 1]}"
  done
}

usage() {
  cat <<EOF
Hooba — установка и обслуживание сервера.
Использование: hooba <команда>
Без команды (просто hooba) — меню: действие выбирается по номеру.

Установка и запуск
  install         установить сервер (пошаговые вопросы); повторно — сменить адрес/квоту
  start           запустить сервер
  stop            остановить сервер
  status          всё ли в порядке: контейнеры, сертификат, диск, копии

Обновление
  update          скачать новую версию и перезапустить (копия базы делается сама)
  rollback        вернуть версию до последнего update, если новая не работает

Если что-то сломалось
  repair          перезапустить всё заново (данные не трогаются)
  logs [сервис]   журнал: backend, web, postgres или coturn (выход — Ctrl+C)
  validate        проверить, что сервер отвечает

Резервные копии (папка backups/)
  backup          копия базы, настроек и картинок чата (--no-uploads — без картинок)
  restore [файл]  восстановить базу (без файла — из самой свежей копии)

Настройки
  uploads-quota [ГиБ]  место под картинки чата
  cert-hooks           заново настроить автопродление сертификата

Нужные порты (открыть в брандмауэре хостинга, если он есть):
  TCP: 80, 443, ${TURN_PORT}, ${TURN_TLS_PORT}, ${MEDIASOUP_RTC_MIN_PORT}-${MEDIASOUP_RTC_MAX_PORT}
  UDP: ${TURN_PORT}, ${MEDIASOUP_RTC_MIN_PORT}-${MEDIASOUP_RTC_MAX_PORT}, ${TURN_MIN_PORT}-${TURN_MAX_PORT}

Папка сервера: ${REPO_ROOT} (журналы каждой команды — в logs/, копии — в backups/).
Если команда hooba не находится, запускайте ${REPO_ROOT}/install.sh <команда>.
EOF
}

main() {
  [[ -f "$COMPOSE_FILE" ]] || bootstrap_from_web "$@"
  local sub="${1:-}"
  case "$sub" in
    "")
      # Меню — только в терминале; из cron и скриптов — список команд.
      if [[ ! -t 0 || ! -t 1 ]]; then
        usage
        return 0
      fi
      ;;
    -h | --help | help)
      usage
      return 0
      ;;
    menu | install | start | stop | status | validate | update | rollback | repair | backup | restore | uploads-quota | cert-hooks | logs) ;;
    *)
      echo "Неизвестная команда: ${sub}"
      echo
      usage
      exit 1
      ;;
  esac
  ensure_root "$@"
  ensure_cli_link
  if (($#)); then shift; fi
  case "$sub" in
    "" | menu) cmd_menu ;;
    install) cmd_install ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    validate) cmd_validate ;;
    update) cmd_update ;;
    rollback) cmd_rollback ;;
    repair) cmd_repair ;;
    backup) cmd_backup "$@" ;;
    restore) cmd_restore "$@" ;;
    uploads-quota) cmd_uploads_quota "$@" ;;
    cert-hooks) cmd_cert_hooks ;;
    logs) cmd_logs "$@" ;;
  esac
}

main "$@"
