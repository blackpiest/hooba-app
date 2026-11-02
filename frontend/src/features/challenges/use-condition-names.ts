import { useMemo } from "react";
import { useAvatarStore } from "@/stores/avatar-store";
import { useChallengeStore } from "@/stores/challenge-store";
import { useChannelStore } from "@/stores/channel-store";
import type { ConditionNames } from "./condition-text";
import { cosmeticName } from "./reward-names";

/** Имена для формулировок условий: каналы, предметы каталога, испытания из моего списка. */
export function useConditionNames(): ConditionNames {
  const channels = useChannelStore((s) => s.channels);
  const catalog = useAvatarStore((s) => s.catalog);
  const mine = useChallengeStore((s) => s.mine);
  return useMemo(
    () => ({
      channel: (id) => channels.find((channel) => channel.id === id)?.name,
      cosmetic: (kind, id) => cosmeticName(catalog, kind, id),
      challenge: (id) => mine?.find((challenge) => challenge.id === id)?.title,
    }),
    [channels, catalog, mine],
  );
}
