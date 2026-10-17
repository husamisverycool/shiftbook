import { addDays, workweekStart, type Weekday } from "@shiftbook/rules";

/**
 * The pay week a forwarded email's timesheets go to: the week that ended most recently before the day
 * the email arrived — the week a coordinator converts next ("last week's timesheets"). A week that is
 * still running is not it, even on its last day.
 */
export const forwardedWeek = (arrivedOn: string, startsOn: Weekday): string => addDays(workweekStart(arrivedOn, startsOn), -7);
