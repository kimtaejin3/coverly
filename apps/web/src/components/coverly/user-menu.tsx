"use client";

import { useState } from "react";
import { SignOut, Ticket } from "@phosphor-icons/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CouponForm } from "@/components/coverly/coupon-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SessionUser {
  email: string | null;
  avatarUrl: string | null;
  creditBalance: number;
  /** Free previews still available on this account. */
  freeRemaining: number;
  /** Whole-song generation, rather than the 30 second preview. */
  canGenerateFull: boolean;
}

export function UserMenu({ user }: { user: SessionUser }) {
  const initial = user.email?.charAt(0).toUpperCase() ?? "?";
  // A dialog rather than a field inside the menu: a dropdown closes the moment you click into an
  // input, which makes typing a code impossible.
  const [couponOpen, setCouponOpen] = useState(false);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="내 계정">
          <Avatar className="size-8">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.email ?? "로그인됨"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            무료 {user.freeRemaining}회 남음 · 크레딧 {user.creditBalance}개
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setCouponOpen(true);
          }}
        >
          <Ticket className="size-4" aria-hidden />
          쿠폰 등록
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action="/auth/signout" method="post" className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <SignOut className="size-4" aria-hidden />
              로그아웃
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={couponOpen} onOpenChange={setCouponOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>쿠폰 등록</DialogTitle>
          <DialogDescription>
            받으신 코드를 입력하면 무료 생성 횟수가 늘어나요.
          </DialogDescription>
        </DialogHeader>
        <CouponForm defaultOpen onDone={() => setCouponOpen(false)} />
      </DialogContent>
    </Dialog>
    </>
  );
}
