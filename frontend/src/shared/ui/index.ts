/** Публичный вход UI-кита: `import { Button, Icon } from "@/shared/ui"`. Новые компоненты экспортируются отсюда. */
export { Icon, ICON_NAMES, type IconName, type IconProps, type IconSize } from "./icon";
export {
  Button,
  IconButton,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
  type IconButtonVariant,
} from "./button";
export { TextField, PasswordField, Textarea, type TextFieldProps, type PasswordFieldProps, type TextareaProps } from "./text-field";
export { Checkbox, type CheckboxProps } from "./checkbox";
export { Radio, RadioGroup, type RadioProps, type RadioGroupProps } from "./radio";
export { Switch, type SwitchProps } from "./switch";
export { Select, type SelectOption, type SelectProps } from "./select";
export { Slider, type SliderProps } from "./slider";
export { Avatar, AvatarStack, PresenceDot, type AvatarLook, type AvatarProps, type AvatarSize } from "./avatar";
export { ServerIcon, type ServerIconProps, type ServerIconSize } from "./server-icon";
export { Badge, Counter, Kbd, KbdCombo, RoleBadge, Tag, UnreadDot, type BadgeVariant } from "./badge";
export { BrandMark } from "./brand-mark";
export { Slime, type SlimeProps, type SlimePose } from "./slime";
export { LoadingDots, MarkLoader, Skeleton, Spinner } from "./loaders";
export { Tooltip, type TooltipProps } from "./tooltip";
export { Divider, type DividerProps } from "./divider";
export { SegmentedControl, type SegmentOption, type SegmentedControlProps } from "./segmented-control";
export { ColorInput, Swatches, type Swatch, type SwatchesProps } from "./swatches";
export { Modal, ConfirmDialog, type ModalProps, type ModalSize, type ConfirmDialogProps } from "./modal";
export { AnchoredPopover, Popover, PopoverTitle, type AnchoredPopoverProps, type PopoverProps } from "./popover";
export { ContextMenu, DropdownMenu, Menu, MenuItem, MenuSection, MenuSeparator, type ContextMenuProps, type DropdownMenuProps, type MenuItemProps } from "./menu";
export { Alert, type AlertProps, type AlertTone } from "./alert";
export { Dialogue, type DialogueProps } from "./dialogue";
export { toast, ToastHost, useToastStore, type ToastItem, type ToastTone } from "./toast";
export { Meter, Progress, type MeterProps, type ProgressProps, type ProgressTone } from "./progress";
export { Tab, TabList, TabPanel, Tabs, type TabPanelProps, type TabProps, type TabsProps } from "./tabs";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export { ListGroup, ListItem, SpeakingEq, VoiceStateIcon, listItemClass, type ListItemProps, type ListItemState } from "./list-item";
export { InlineCode, Mention, Message, type MessageProps, type MessageStatus } from "./message";
export { ReactionBar, ReactionChip, ReactionDetails, ReactionPerson, type ReactionChipProps } from "./reaction";
export { Composer, ComposerTextarea, type ComposerProps, type ComposerTextareaProps } from "./composer";
export { Toolbar, ToolbarDivider, type ToolbarProps } from "./toolbar";
export { Topbar, WindowControls, type TopbarProps, type WindowControlsProps } from "./topbar";
export { UserDock, type UserDockProps } from "./user-dock";
export { Card, Section, type CardProps, type CardVariant, type SectionProps } from "./card";
export {
  BASE_FRAME_LABEL,
  frameSkin,
  ProfileBackground,
  ProfileCardFrame,
  ProfileCardWindow,
  ProfilePlate,
  type BackgroundLayerSpec,
  type BackgroundSpec,
  type BadgeCategory,
  type BadgeIconSpec,
  type BadgeSpec,
  type CharacterIdleSpec,
  type CosmeticLayerSpec,
  type FrameEdgeSpec,
  type FrameSparksSpec,
  type FrameSpec,
  type ProfileCardFrameProps,
  type ProfileCosmetics,
  type TitleSpec,
} from "./profile-card";
export { InviteCodeCard, type InviteCodeCardProps, type InviteCodeStatus } from "./invite-code-card";
export { Stage, type StageProps } from "./stage";
export { Logo, type LogoProps } from "./logo";
export { BrandBackdrop } from "./brand-backdrop";
export { TextLink, linkClass } from "./link";
export { FieldGroup, SectionLabel, SettingRow } from "./setting-row";
export { TileGrid, type TileGridProps, type TileItem } from "./tile-grid";
export { BADGE_CATEGORY_LABEL, BadgeCard, BadgeCategoryTag, BadgeIcon } from "./badge-icon";
export { Disclosure, DragHandle, type DisclosureProps, type DragHandleProps } from "./disclosure";
