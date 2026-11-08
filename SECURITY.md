# Security

## Reporting a vulnerability

**Do not open a public issue**: until the vulnerability is fixed, anyone could read its description.

Report it privately: **Security** tab → **Report a vulnerability** ([link](https://github.com/blackpiest/hooba-app/security/advisories/new)). Only the project author will see your report.

Please include:

- the version: the output of `git -C /opt/hooba log -1 --oneline` (a line like `release: main@abc1234`);
- what the vulnerability allows and who can exploit it (an unauthenticated visitor, a member, a moderator);
- steps to reproduce.

**Do not attach** the `.env.prod` file, passwords, tokens, TURN keys, database backups or members' messages, whether yours or anyone else's. A report does not need them: if you have to show sample data, make it up.

## What happens next

The author will confirm receipt of your report, review it and let you know when a fix is released. Fixes ship in regular updates: server owners get them by running `hooba update`. Details of the vulnerability are published after the fix is released.

## Supported versions

Fixes are released only for the latest version on the `main` branch. If your server has not been updated for a while, run `hooba update` first and check whether the problem still reproduces.

Modified builds and forks are supported by their own authors.
