/**
 * The portal link as one request sees it: the shell and the section read it once (React's per-request
 * cache), so moving between sections checks the link once.
 */
import { cache } from "react";
import { approvalDeps } from "../services";
import { openPortal } from "./service";

export const portalSession = cache((token: string) => openPortal(approvalDeps(""), token));
