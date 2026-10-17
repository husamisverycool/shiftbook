"use client";

// Patterns: docs/patterns/clients.md and docs/patterns/clients/[id].md (completeness audit G1) —
// Stripe's "Add customer" (or N) dialog and its customer page's Actions › Edit information; Gusto's
// company locations (Add location; each location's menu with Edit and Deactivate; an address where
// people worked cannot be edited), with the county and city or town picked from the Census list
// (decision 0008).
import { ArchiveIcon, ArchiveRestoreIcon, EllipsisIcon, MapPinIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveClientAction, archiveWorksiteAction, censusCountiesAction, censusPlacesAction, createClientAction, createWorksiteAction, updateClientAction, updateWorksiteAction } from "@/app/[locale]/(app)/clients/setup-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { County, Place } from "@/server/places/census";
import { typing } from "../app-sidebar";
import { Section } from "../page";

type Problem = { field: string; rule: string };
const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- the client: add and edit ----------

export interface ClientFormValues {
  name: string;
  code: string;
  addressLines: string[];
  billingEmail: string | null;
}

/** Add client (or N) on the clients list; Stripe's "Add customer". `shortcut`: this one answers N. */
export function AddClientButton({ shortcut = true }: { shortcut?: boolean }) {
  const t = useTranslations("clientSetup");
  const [open, setOpen] = useState(false);
  const lastKey = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const previous = lastKey.current;
      lastKey.current = { key: e.key.toLowerCase(), at: Date.now() };
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector("[role=dialog]")) return;
      // "G then N" goes to Notifications (the app's jumps): only a bare N adds a client.
      if (e.key.toLowerCase() === "n" && !(previous.key === "g" && Date.now() - previous.at < 1500)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="add-client">
        <PlusIcon />
        {t("add")}
        {shortcut && <kbd className="ml-1 hidden rounded border border-current/30 px-1 text-[11px] opacity-70 sm:inline">N</kbd>}
      </Button>
      {open && <ClientDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** The client's details dialog: adding (with payment terms) or editing (Stripe's "Update customer"). */
export function ClientDialog({ client, onClose }: { client?: ClientFormValues & { id: string }; onClose: () => void }) {
  const t = useTranslations("clientSetup");
  const tc = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState(client?.name ?? "");
  const [code, setCode] = useState(client?.code ?? "");
  const [email, setEmail] = useState(client?.billingEmail ?? "");
  const [address, setAddress] = useState(client?.addressLines.join("\n") ?? "");
  const [terms, setTerms] = useState("30");
  const [problems, setProblems] = useState<Problem[]>([]);
  const [pending, start] = useTransition();
  const error = (field: string) => {
    const p = problems.find((x) => x.field === field);
    return p ? t(`rules.${p.rule}` as never) : undefined;
  };
  const invalid = (field: string) => (error(field) ? { "aria-invalid": true, "aria-describedby": `client-${field}-error` } : {});

  const save = () =>
    start(async () => {
      const values = { name: name.trim(), code: code.trim(), addressLines: lines(address), billingEmail: email.trim() === "" ? null : email.trim() };
      const r = client ? await updateClientAction(client.id, values) : await createClientAction({ ...values, paymentTermsDays: /^\d+$/.test(terms.trim()) ? Number(terms.trim()) : -1 });
      if (r.ok) {
        toast.success(client ? t("updated") : t("added"));
        onClose();
        if (!client) router.push(`/clients/${r.id}`);
        else router.refresh();
        return;
      }
      if (r.error === "invalid") setProblems(r.problems);
      else if (r.error === "code_taken") setProblems([{ field: "code", rule: "code_taken" }]);
      else toast.error(r.error === "busy" ? t("busy") : t("generic"));
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="client-dialog">
        <DialogHeader>
          <DialogTitle>{client ? t("editTitle") : t("addTitle")}</DialogTitle>
          {!client && <DialogDescription>{t("addBody")}</DialogDescription>}
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field id="client-name" label={t("field.name")} error={error("name")}>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={200} {...invalid("name")} data-testid="client-name" />
          </Field>
          <Field id="client-code" label={t("field.code")} hint={t("field.codeHint")} error={error("code")}>
            <Input id="client-code" className="w-48" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} {...invalid("code")} data-testid="client-code" />
          </Field>
          <Field id="client-billingEmail" label={t("field.billingEmail")} hint={t("field.billingEmailHint")} error={error("billingEmail")}>
            <Input id="client-billingEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} {...invalid("billingEmail")} data-testid="client-email" />
          </Field>
          <Field id="client-addressLines" label={t("field.address")} hint={t("field.addressHint")} error={error("addressLines")}>
            <Textarea id="client-addressLines" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} {...invalid("addressLines")} data-testid="client-address" />
          </Field>
          {!client && (
            <Field id="client-paymentTermsDays" label={t("field.terms")} error={error("paymentTermsDays")}>
              <Input id="client-paymentTermsDays" className="w-32" inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value)} {...invalid("paymentTermsDays")} data-testid="client-terms" />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending} loadingLabel={tc("loading")} data-testid="client-save">
              {client ? t("update") : t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The client page's Actions menu (Stripe's customer Actions): Edit information, Archive or Restore. */
export function ClientActions({ client, archived }: { client: ClientFormValues & { id: string }; archived: boolean }) {
  const t = useTranslations("clientSetup");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  const archive = (to: boolean) =>
    start(async () => {
      const r = await archiveClientAction(client.id, to);
      if (r.ok) {
        toast.success(to ? t("archivedDone") : t("restored"));
        router.refresh();
      } else toast.error(r.error === "active_placements" ? t("activePlacements") : r.error === "busy" ? t("busy") : t("generic"));
    });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" data-testid="client-actions" />}>
          {t("actions")}
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)} data-testid="client-edit">
            <PencilIcon />
            {t("edit")}
          </DropdownMenuItem>
          {archived ? (
            <DropdownMenuItem onClick={() => archive(false)} data-testid="client-restore">
              <ArchiveRestoreIcon />
              {t("restore")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => archive(true)} data-testid="client-archive">
              <ArchiveIcon />
              {t("archive")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <ClientDialog client={client} onClose={() => setEditing(false)} />}
    </>
  );
}

// ---------- worksites ----------

export interface WorksiteRow {
  id: string;
  name: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  county: string;
  countyFips: string | null;
  placeFips: string | null;
  placeName: string | null;
  outsideAnyPlace: boolean;
  archived: boolean;
  /** Hours were worked here: its state, county and place stay as they are. */
  placeFixed: boolean;
}

/** The client's worksites (Gusto's company locations), with Add worksite at the heading's right. */
export function WorksitesSection({ clientId, rows, states, mayChange }: { clientId: string; rows: WorksiteRow[]; states: string[]; mayChange: boolean }) {
  const t = useTranslations("clientSetup.worksites");
  const tt = useTranslations("clientSetup");
  const router = useRouter();
  const [dialog, setDialog] = useState<WorksiteRow | "new" | null>(null);
  const [, start] = useTransition();
  const archive = (row: WorksiteRow, to: boolean) =>
    start(async () => {
      const r = await archiveWorksiteAction(row.id, to);
      if (r.ok) {
        toast.success(to ? t("archivedDone") : t("restored"));
        router.refresh();
      } else toast.error(r.error === "active_placements" ? t("activePlacements") : r.error === "busy" ? tt("busy") : tt("generic"));
    });
  return (
    <Section
      id="worksites-title"
      title={t("title")}
      accessory={rows.length > 0 ? rows.length : undefined}
      testId="worksites"
      actions={
        mayChange ? (
          <Button size="sm" variant="outline" onClick={() => setDialog("new")} data-testid="add-worksite">
            <PlusIcon />
            {t("add")}
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="no-worksites">
          {t("none")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {rows.map((w) => (
            <li key={w.id} className="flex items-start gap-3 py-3 text-sm" data-testid="worksite-row">
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{w.name}</span>
                  {w.archived && <Badge variant="secondary">{t("archived")}</Badge>}
                </div>
                <span className="text-muted-foreground">{`${w.addressLine}, ${w.city}, ${w.state} ${w.postalCode}`}</span>
                <span className="text-[13px] text-muted-foreground">{t("where", { county: w.county, place: w.outsideAnyPlace ? t("outside") : (w.placeName ?? "—") })}</span>
              </div>
              {mayChange && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("menu", { name: w.name })} data-testid="worksite-menu" />}>
                    <EllipsisIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDialog(w)} data-testid="worksite-edit">
                      <PencilIcon />
                      {t("edit")}
                    </DropdownMenuItem>
                    {w.archived ? (
                      <DropdownMenuItem onClick={() => archive(w, false)}>
                        <ArchiveRestoreIcon />
                        {t("restore")}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => archive(w, true)} data-testid="worksite-archive">
                        <ArchiveIcon />
                        {t("archive")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog && <WorksiteDialog clientId={clientId} row={dialog === "new" ? null : dialog} states={states} onClose={() => setDialog(null)} />}
    </Section>
  );
}

const OUTSIDE = "outside";

function WorksiteDialog({ clientId, row, states, onClose }: { clientId: string; row: WorksiteRow | null; states: string[]; onClose: () => void }) {
  const t = useTranslations("clientSetup.worksites");
  const tt = useTranslations("clientSetup");
  const tc = useTranslations("common");
  const router = useRouter();
  const fixed = row?.placeFixed ?? false;
  const [name, setName] = useState(row?.name ?? "");
  const [street, setStreet] = useState(row?.addressLine ?? "");
  const [city, setCity] = useState(row?.city ?? "");
  const [state, setState] = useState(row?.state ?? "");
  const [zip, setZip] = useState(row?.postalCode ?? "");
  const [county, setCounty] = useState(row?.countyFips ?? "");
  const [place, setPlace] = useState(row ? (row.outsideAnyPlace ? OUTSIDE : (row.placeFips ?? "")) : "");
  // Each list remembers what it was loaded for, so a stale answer never shows.
  const [countyList, setCountyList] = useState<{ key: string; list: County[] }>({ key: "", list: [] });
  const [placeList, setPlaceList] = useState<{ key: string; list: Place[] }>({ key: "", list: [] });
  const counties = countyList.key === state ? countyList.list : [];
  const places = placeList.key === `${state}|${county}` ? placeList.list : [];
  const [problems, setProblems] = useState<Problem[]>([]);
  const [pending, start] = useTransition();

  // The Census lists, loaded as the state and county are chosen.
  useEffect(() => {
    if (!state) return;
    let live = true;
    void censusCountiesAction(state).then((list) => live && setCountyList({ key: state, list }));
    return () => {
      live = false;
    };
  }, [state]);
  useEffect(() => {
    if (!state || !county) return;
    let live = true;
    void censusPlacesAction(state, county).then((list) => live && setPlaceList({ key: `${state}|${county}`, list }));
    return () => {
      live = false;
    };
  }, [state, county]);

  const error = (field: string) => {
    const p = problems.find((x) => x.field === field);
    return p ? t(`rules.${p.rule}` as never) : undefined;
  };
  const invalid = (field: string) => (error(field) ? { "aria-invalid": true, "aria-describedby": `site-${field}-error` } : {});

  const save = () =>
    start(async () => {
      const values = { name: name.trim(), addressLine: street.trim(), city: city.trim(), state, postalCode: zip.trim(), countyFips: county, placeFips: place === OUTSIDE || place === "" ? null : place, outsideAnyPlace: place === OUTSIDE };
      if (place === "") {
        setProblems([{ field: "placeFips", rule: "place" }]);
        return;
      }
      const r = row ? await updateWorksiteAction(row.id, values) : await createWorksiteAction(clientId, values);
      if (r.ok) {
        toast.success(t("saved"));
        onClose();
        router.refresh();
        return;
      }
      if (r.error === "invalid") setProblems(r.problems);
      else if (r.error === "place_in_use") setProblems([{ field: "placeFips", rule: "place_in_use" }]);
      else toast.error(r.error === "busy" ? tt("busy") : tt("generic"));
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="worksite-dialog">
        <DialogHeader>
          <DialogTitle>{row ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{fixed ? t("fixed") : t("addBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field id="site-name" label={t("field.name")} error={error("name")}>
            <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={200} {...invalid("name")} data-testid="site-name" />
          </Field>
          <Field id="site-addressLine" label={t("field.street")} error={error("addressLine")}>
            <Input id="site-addressLine" value={street} onChange={(e) => setStreet(e.target.value)} maxLength={200} {...invalid("addressLine")} data-testid="site-street" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem_8rem]">
            <Field id="site-city" label={t("field.city")} error={error("city")}>
              <Input id="site-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={200} {...invalid("city")} data-testid="site-city" />
            </Field>
            <Field id="site-state" label={t("field.state")} error={error("state")}>
              <NativeSelect
                id="site-state"
                className="w-full"
                value={state}
                disabled={fixed}
                onChange={(e) => {
                  setState(e.target.value);
                  setCounty("");
                  setPlace("");
                }}
                {...invalid("state")}
                data-testid="site-state"
              >
                <NativeSelectOption value="">{t("chooseState")}</NativeSelectOption>
                {states.map((s) => (
                  <NativeSelectOption key={s} value={s}>
                    {s}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field id="site-postalCode" label={t("field.zip")} error={error("postalCode")}>
              <Input id="site-postalCode" inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} maxLength={10} {...invalid("postalCode")} data-testid="site-zip" />
            </Field>
          </div>
          <Field id="site-countyFips" label={t("field.county")} error={error("countyFips")}>
            <NativeSelect
              id="site-countyFips"
              className="w-full"
              value={county}
              disabled={fixed || !state}
              onChange={(e) => {
                setCounty(e.target.value);
                setPlace("");
              }}
              {...invalid("countyFips")}
              data-testid="site-county"
            >
              <NativeSelectOption value="">{t("chooseCounty")}</NativeSelectOption>
              {/* The county already saved, while the list loads. */}
              {county && !counties.some((c) => c.fips === county) && row?.countyFips === county && <NativeSelectOption value={county}>{row.county}</NativeSelectOption>}
              {counties.map((c) => (
                <NativeSelectOption key={c.fips} value={c.fips}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field id="site-placeFips" label={t("field.place")} hint={t("placeHint")} error={error("placeFips")}>
            <NativeSelect id="site-placeFips" className="w-full" value={place} disabled={fixed || !county} onChange={(e) => setPlace(e.target.value)} {...invalid("placeFips")} data-testid="site-place">
              <NativeSelectOption value="">{t("choosePlace")}</NativeSelectOption>
              <NativeSelectOption value={OUTSIDE}>{t("outside")}</NativeSelectOption>
              {place && place !== OUTSIDE && !places.some((p) => p.fips === place) && row?.placeFips === place && <NativeSelectOption value={place}>{row.placeName ?? place}</NativeSelectOption>}
              {places.map((p) => (
                <NativeSelectOption key={p.fips} value={p.fips}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" loading={pending} loadingLabel={tc("loading")} data-testid="site-save">
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
