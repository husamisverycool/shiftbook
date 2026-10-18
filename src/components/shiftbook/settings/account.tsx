"use client";

// Pattern: docs/patterns/settings/account.md — laid out as Linear's settings (docs/patterns/_components/
// settings.md: Preferences' rows in a panel); the content from Slack "Language & region" and GitHub
// "Password and authentication" (change password; two-factor setup; recovery codes, a new set ends the old).
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { changePasswordAction, newRecoveryCodesAction, setAccentAction, setAppearanceAction, setLanguageAction, signOutAction } from "@/app/[locale]/(auth)/actions";
import { applyAccent, type Appearance } from "../theme";
import { ACCENTS, type Accent } from "@/lib/accent";
import { CheckIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Role } from "@/server/permissions";
// Decision 0032.
import { PasskeysSection, type PasskeyItem } from "./passkeys";
import { AuthenticatorSetup, RecoveryCodes } from "../auth/authenticator-setup";
import { useConfirmed } from "../auth/confirm-access";
import { NewPasswordFields } from "../auth/fields";
import { useDateTime } from "../agency-zone";
import { ConnectedAccounts } from "./connected-accounts";
import { SettingsFooter, SettingsPage, SettingsPanel, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";

export interface AccountProps {
  name: string;
  email: string;
  role: Role;
  demo: boolean;
  requiresAuthenticator: boolean;
  hasPassword: boolean;
  passwordChangedAt: string | null;
  authenticatorSince: string | null;
  /** Decision 0032. */
  passkeys: PasskeyItem[];
  recoveryCodesLeft: number | null;
  appearance: Appearance;
  accent: Accent;
}

export function AccountView(props: AccountProps) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const tr = useTranslations("roles");
  const tc = useTranslations("setup");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [savingLanguage, startLanguage] = useTransition();
  const [appearance, setAppearanceState] = useState<Appearance>(props.appearance);
  const [savingAppearance, startAppearance] = useTransition();
  const { setTheme } = useTheme();
  const [accent, setAccentState] = useState<Accent>(props.accent);
  const [, startAccent] = useTransition();
  const [savingPassword, startPassword] = useTransition();
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordKey, setPasswordKey] = useState(0);
  const [settingUp, setSettingUp] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [makingCodes, startCodes] = useTransition();
  const [leaving, leave] = useTransition();
  const confirmed = useConfirmed();
  const dateTime = useDateTime();
  const when = (iso: string) => dateTime(iso, { date: "long", time: false });

  return (
    <SettingsPage
      context={t("eyebrow")}
      title={t("title")}
      description={
        <>
          <p className="text-foreground">{props.name}</p>
          <p>{t("who", { email: props.email, role: tr(`${props.role}.name`) })}</p>
          {props.demo && <p>{t("demoNote")}</p>}
        </>
      }
    >
      {/* GitHub's Appearance and Linear's "Interface and theme": each person's own theme and colour (decision 0046). */}
      <SettingsSection title={t("appearanceTitle")} id="appearance" testId="appearance-section">
        <SettingsRows>
          {/* Geist, GitHub and Linear: System, Light, Dark — applied at once, kept for the person. */}
          <SettingsRow
            label={t("themeLabel")}
            htmlFor={`${id}-appearance-select`}
            description={t("appearanceHint")}
            descriptionId={`${id}-appearance-hint`}
            control={
              <NativeSelect
                id={`${id}-appearance-select`}
                value={appearance}
                disabled={savingAppearance}
                aria-describedby={`${id}-appearance-hint`}
                onChange={(e) => {
                  const next = e.target.value as Appearance;
                  setAppearanceState(next);
                  setTheme(next);
                  startAppearance(async () => {
                    const r = await setAppearanceAction(next);
                    if (r.ok) toast.success(t("appearanceSaved"));
                  });
                }}
                className="w-40"
                data-testid="appearance"
              >
                <NativeSelectOption value="system">{t("appearanceSystem")}</NativeSelectOption>
                <NativeSelectOption value="light">{t("appearanceLight")}</NativeSelectOption>
                <NativeSelectOption value="dark">{t("appearanceDark")}</NativeSelectOption>
              </NativeSelect>
            }
          />
          <AccentPicker
            value={accent}
            onChange={(next) => {
              setAccentState(next);
              applyAccent(next);
              startAccent(async () => {
                const r = await setAccentAction(next);
                if (r.ok) toast.success(t("accentSaved"));
              });
            }}
          />
        </SettingsRows>
      </SettingsSection>

      {/* Linear's Preferences: a section of rows, the select at the row's right. */}
      <SettingsSection title={t("preferencesTitle")}>
        <SettingsRows>
          <SettingsRow
            label={t("language")}
            htmlFor={`${id}-language-select`}
            description={t("languageHint")}
            descriptionId={`${id}-language-hint`}
            control={
              <NativeSelect
                id={`${id}-language-select`}
                value={locale}
                disabled={savingLanguage}
                aria-describedby={`${id}-language-hint`}
                onChange={(e) => {
                  const next = e.target.value;
                  startLanguage(async () => {
                    const r = await setLanguageAction(next);
                    if (!r.ok) return;
                    toast.success(t("languageSaved"));
                    router.replace(pathname, { locale: next });
                  });
                }}
                className="w-40"
                data-testid="language"
              >
                <NativeSelectOption value="en" lang="en">
                  English
                </NativeSelectOption>
                <NativeSelectOption value="es" lang="es">
                  Español
                </NativeSelectOption>
              </NativeSelect>
            }
          />
        </SettingsRows>
      </SettingsSection>

      {/* GitHub's Change password, its fields in the panel and the button in the panel's foot. */}
      <SettingsSection title={t("passwordTitle")} description={props.passwordChangedAt ? t("passwordChanged", { date: when(props.passwordChangedAt) }) : t("passwordNever")}>
        <NewPasswordFields
          key={passwordKey}
          email={props.email}
          pending={savingPassword}
          submitLabel={props.hasPassword ? t("update") : t("set")}
          pendingLabel={t("saving")}
          serverError={passwordError}
          currentField={props.hasPassword ? { label: t("current") } : undefined}
          labels={{ password: t("new"), confirm: t("confirm") }}
          frame={(fields, submit) => <SettingsPanel footer={<SettingsFooter>{submit}</SettingsFooter>}>{fields}</SettingsPanel>}
          onSubmit={(next, current) =>
            startPassword(async () => {
              // A first password (no current one to give) confirms it's them first (decision 0033, review L3).
              const r = await confirmed(() => changePasswordAction(current, next));
              if (!r) return;
              if (r.ok) {
                setPasswordError(null);
                setPasswordKey((k) => k + 1);
                toast.success(t("passwordSaved"));
                router.refresh();
              } else setPasswordError(r.error);
            })
          }
        />
      </SettingsSection>

      {/* GitHub's two-factor methods as Linear rows: the method and its state, the action at the right. */}
      <SettingsSection title={t("authTitle")}>
        {settingUp ? (
          <SettingsPanel>
            <AuthenticatorSetup
              email={props.email}
              onCancel={() => setSettingUp(false)}
              onFinished={() => {
                setSettingUp(false);
                router.refresh();
              }}
            />
          </SettingsPanel>
        ) : props.authenticatorSince ? (
          <SettingsRows>
            <SettingsRow
              label={t("authApp")}
              description={
                <>
                  <span className="block" data-testid="authenticator-on">
                    {t("authOn", { date: when(props.authenticatorSince) })}
                  </span>
                  <span id={`${id}-again-hint`} className="block">
                    {t("setUpAgainHint")}
                  </span>
                </>
              }
              control={
                <Button variant="ghost" onClick={() => setSettingUp(true)} aria-describedby={`${id}-again-hint`} data-testid="set-up-again">
                  {t("setUpAgain")}
                </Button>
              }
            />
            <SettingsRow
              label={t("recoveryTitle")}
              description={t("recoveryLeft", { count: props.recoveryCodesLeft ?? 0 })}
              descriptionTestId="recovery-left"
              control={
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" disabled={makingCodes} />}>{t("newCodes")}</AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("newCodesTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("newCodesBody")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          startCodes(async () => {
                            const r = await confirmed(() => newRecoveryCodesAction());
                            if (r?.ok) setNewCodes(r.recoveryCodes);
                          })
                        }
                        data-testid="new-codes-confirm"
                      >
                        {t("newCodesConfirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              }
            />
          </SettingsRows>
        ) : (
          <SettingsRows>
            <SettingsRow
              label={t("authApp")}
              description={`${t("authOff")}${props.requiresAuthenticator ? ` ${t("authRequired")}` : ""}`}
              control={
                <Button variant="ghost" onClick={() => setSettingUp(true)} data-testid="set-up-authenticator">
                  {t("setUp")}
                </Button>
              }
            />
          </SettingsRows>
        )}
      </SettingsSection>

      <PasskeysSection passkeys={props.passkeys} />
      <ConnectedAccounts />

      {/* Linear's "Workspace access": one row, the action at its right. */}
      <SettingsRows>
        <SettingsRow
          label={t("signOutLine")}
          control={
            <Button variant="ghost" disabled={leaving} onClick={() => leave(() => signOutAction())} data-testid="account-sign-out" loading={leaving} loadingLabel={tCommon("loading")}>
              {t("signOut")}
            </Button>
          }
        />
      </SettingsRows>

      <Dialog open={newCodes !== null} onOpenChange={(open) => !open && setNewCodes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("recoveryTitle")}</DialogTitle>
          </DialogHeader>
          {newCodes && (
            <RecoveryCodes
              email={props.email}
              codes={newCodes}
              title={t("recoveryTitle")}
              onSaved={() => {
                setNewCodes(null);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}

/**
 * The colour cards (GitHub's theme cards): a radio group — arrow keys move and choose, the choice shows
 * at once. Each swatch takes its accent's own button colour from globals.css through data-accent.
 */
function AccentPicker({ value, onChange }: { value: Accent; onChange: (next: Accent) => void }) {
  const t = useTranslations("account");
  const id = useId();
  const refs = useRef(new Map<Accent, HTMLButtonElement>());
  const move = (from: Accent, step: number) => {
    const next = ACCENTS[(ACCENTS.indexOf(from) + step + ACCENTS.length) % ACCENTS.length]!;
    onChange(next);
    refs.current.get(next)?.focus();
  };
  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-0.5">
        <span id={`${id}-label`} className="text-sm font-medium">
          {t("accentLabel")}
        </span>
        <span id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {t("accentHint")}
        </span>
      </div>
      <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="accent-picker">
        {ACCENTS.map((a) => {
          const chosen = a === value;
          return (
            <button
              key={a}
              ref={(el) => {
                if (el) refs.current.set(a, el);
                else refs.current.delete(a);
              }}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen ? 0 : -1}
              onClick={() => onChange(a)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(a, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(a, -1);
                }
              }}
              data-testid={`accent-${a}`}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                chosen && "border-foreground",
              )}
            >
              <span data-accent={a} aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {chosen && <CheckIcon className="size-3" />}
              </span>
              <span className="font-medium">{t(`accentNames.${a}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
