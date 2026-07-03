"use client";
import { BottomSheet } from "./bottom-sheet";
import { ProfileImage, ProfileDetails, type ProfileBot } from "./profile-panel";

// 채팅 모바일: 헤더 프로필 버튼으로 여는 바텀시트. 데스크톱 ProfilePanel과 본문 공유.
export function MobileProfileSheet({
  bot,
  onReport,
  open,
  onClose,
}: {
  bot: ProfileBot;
  onReport: () => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <ProfileImage name={bot.name} className="-mx-4 -mt-4 mb-2 h-40 rounded-t-2xl sm:-mx-5 sm:-mt-5" />
      <ProfileDetails bot={bot} onReport={onReport} />
    </BottomSheet>
  );
}
