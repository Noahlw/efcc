"use client";

import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function dateFromValue(value: string): Date | undefined {
  const [year, month, day] = value.split("-").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return undefined;
  }
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}

function valueFromDate(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0")
    )
    .join("-");
}

export const ProgramDatePicker = ({
  id,
  label,
  name,
  value,
  placeholder,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  name?: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const selected = dateFromValue(value);

  return (
    <>
      {name !== undefined && <Input type="hidden" name={name} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={label}
            aria-haspopup="dialog"
            data-empty={selected === undefined}
            className={cn(
              "w-full justify-start border-[var(--screen-line-strong)] bg-[var(--screen-surface)] text-left text-base font-normal",
              selected === undefined && "text-[var(--screen-muted)]"
            )}
          >
            <CalendarDays aria-hidden="true" />
            {selected ? format(selected, "yyyy年M月d日") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (!date) {
                return;
              }
              onChange(valueFromDate(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </>
  );
};
