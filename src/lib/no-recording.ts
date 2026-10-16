/** How a demo reading that was never recorded begins (extraction/transport.ts), so screens can say it plainly. */
export const NO_RECORDING_PREFIX = "Demo mode makes no outside calls, so photos and PDFs are read only from readings recorded earlier";

export const isNoRecording = (error: string | null): boolean => Boolean(error?.startsWith(NO_RECORDING_PREFIX));
