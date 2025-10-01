import { DateTime, DateTimeUnit } from "luxon";

export class DateUtil {
  static getUTCDate(): DateTime {
    return DateTime.utc();
  }

  static getDate(date: string): DateTime {
    return DateTime.fromISO(date);
  }

  static getTimestamp(): number {
    return DateUtil.getUTCDate().toMillis();
  }

  static getFormat(format: string): string {
    return DateUtil.getUTCDate().toFormat(format);
  }

  static getDuration(startTime: number): number {
    return DateUtil.getTimestamp() - startTime;
  }

  static getISO(): string {
    return DateUtil.getUTCDate().toISO() ?? "";
  }

  static getStartOf(date?: string, unit?: DateTimeUnit): string {
    date = date ? date : DateUtil.getISO();
    return (
      DateTime.fromISO(date)
        .startOf(unit ?? "month")
        .toISO() ?? ""
    );
  }

  static getEndOf(date?: string, unit?: DateTimeUnit): string {
    date = date ? date : DateUtil.getISO();
    return (
      DateTime.fromISO(date)
        .endOf(unit ?? "month")
        .toISO() ?? ""
    );
  }

  static ISOToFormat(date: string, format: string): string {
    return DateTime.fromISO(date).toFormat(format);
  }

  static FormatToISO(date: string, format: string): string {
    return DateTime.fromFormat(date, format, { zone: "UTC" }).toISO() ?? "";
  }

  static getFutureTime(spanMins: number): number {
    return DateUtil.getTimestamp() + spanMins * 60 * 1000;
  }

  static getMonthName(month: number): string {
    return DateTime.utc().set({ month }).toFormat("LLL");
  }
  static getFormattedEndOfMonth(isoDate: string, format: string): string {
    return this.ISOToFormat(this.getEndOf(isoDate, "month"), format);
  }
  static getLastThreeMonths(): Array<{
    month: number;
    year: number;
    monthName: string;
  }> {
    const today = DateTime.utc();
    const result: Array<{ month: number; year: number; monthName: string }> = [];

    for (let i = 0; i < 3; i++) {
      const m = today.plus({ months: -i });

      result.push({
        month: m.month,
        year: m.year,
        monthName: `${m.monthShort} ${m.year}`,
      });
    }
    return result;
  }
}

export class Duration {
  private startTime: number;

  constructor() {
    this.startTime = DateUtil.getTimestamp();
  }

  lapse(): number {
    return DateUtil.getDuration(this.startTime);
  }
}
