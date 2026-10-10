"use client";

import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DateTimePickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  onConfirm: (date: string, time: string) => void;
  /** Show the time input. The New Transaction page passes false: time is never saved. */
  showTime?: boolean;
}

export function formatDateTimeDisplay(dateStr: string, timeStr?: string): string {
  if (!dateStr) return "Select date & time";
  
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  let dateLabel = dateStr;
  if (dateStr === todayISO) {
    dateLabel = "Today";
  } else if (dateStr === yesterdayISO) {
    dateLabel = "Yesterday";
  } else {
    // Format Month Day, Year
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }

  if (!timeStr) return dateLabel;

  // Format 12-hour or 24-hour time
  const [h, m] = timeStr.split(":").map(Number);
  if (!isNaN(h) && !isNaN(m)) {
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const minStr = String(m).padStart(2, "0");
    return `${dateLabel}, ${hour12}:${minStr} ${period}`;
  }

  return `${dateLabel}, ${timeStr}`;
}

export function DateTimePickerSheet({
  open,
  onOpenChange,
  date,
  time,
  onConfirm,
  showTime = true,
}: DateTimePickerSheetProps) {
  const [tempDate, setTempDate] = useState(date);
  const [tempTime, setTempTime] = useState(time);

  useEffect(() => {
    if (open) {
      setTempDate(date);
      setTempTime(time);
    }
  }, [open, date, time]);

  const setNow = () => {
    const now = new Date();
    const dStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const tStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setTempDate(dStr);
    setTempTime(tStr);
  };

  const setToday = () => {
    const now = new Date();
    const dStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    setTempDate(dStr);
  };

  const setYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setTempDate(dStr);
  };

  const handleDone = () => {
    onConfirm(tempDate, tempTime);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex flex-col p-0 pb-[var(--sab)] rounded-t-3xl bg-background border-t border-border text-foreground max-h-[85dvh]"
      >
        <SheetHeader className="px-5 py-4 border-b border-border shrink-0">
          <SheetTitle className="text-foreground text-lg font-semibold">
            Date & Time
          </SheetTitle>
        </SheetHeader>

        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Quick Presets */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={setNow}
              className="flex-1 py-2 px-3 rounded-xl bg-card border border-border text-xs font-medium text-foreground active:bg-muted transition-colors"
            >
              Right Now
            </button>
            <button
              type="button"
              onClick={setToday}
              className="flex-1 py-2 px-3 rounded-xl bg-card border border-border text-xs font-medium text-foreground active:bg-muted transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={setYesterday}
              className="flex-1 py-2 px-3 rounded-xl bg-card border border-border text-xs font-medium text-foreground active:bg-muted transition-colors"
            >
              Yesterday
            </button>
          </div>

          {/* Date Picker Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={tempDate}
                onChange={(e) => setTempDate(e.target.value)}
                className="w-full bg-card border border-border rounded-xl p-3.5 text-foreground text-base focus:border-ring focus:outline-none transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Time Picker Input */}
          {showTime && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Time
            </label>
            <div className="relative">
              <input
                type="time"
                value={tempTime}
                onChange={(e) => setTempTime(e.target.value)}
                className="w-full bg-card border border-border rounded-xl p-3.5 text-foreground text-base focus:border-ring focus:outline-none transition-colors [color-scheme:dark]"
              />
            </div>
          </div>
          )}

          {/* Summary Display */}
          <div className="p-3.5 rounded-xl bg-card/60 border border-border/80 text-center">
            <span className="text-xs text-muted-foreground">Selected: </span>
            <span className="text-sm font-medium text-primary">
              {formatDateTimeDisplay(tempDate, showTime ? tempTime : undefined)}
            </span>
          </div>

          {/* Confirm Button */}
          <Button
            type="button"
            onClick={handleDone}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-base flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
