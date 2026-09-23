export type AvailabilityRule = {
  dayOfWeek: number; // 0 Sunday ... 6 Saturday
  startMinute: number;
  endMinute: number;
  active: boolean;
};

export type BusyInterval = {
  startsAt: Date;
  endsAt: Date;
};

export type Slot = {
  startsAt: Date;
  endsAt: Date;
};

export type AvailabilityOptions = {
  from: Date;
  to: Date;
  durationMinutes: number;
  slotIntervalMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
};
