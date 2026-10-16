import type { ObligationKind } from "@shiftbook/rules";

/** The kinds of obligation the run records itself (Illinois equal pay, slice c); compliance works out the rest. */
export const EQUAL_PAY_KINDS = ["il_equal_pay_720h", "il_equal_pay_4160h"] as const satisfies readonly ObligationKind[];
