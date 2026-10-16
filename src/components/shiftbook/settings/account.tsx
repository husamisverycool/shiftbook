"use client";

// Pattern: docs/patterns/settings/account.md — Slack "Language & region"; GitHub "Password and
// authentication" (change password; two-factor setup; recovery codes, a new set ends the old).
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { changePasswordAction, newRecoveryCodesAction, setLanguageAction, signOutAction } from "@/app/[locale]/(auth)/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Role } from "@/server/permissions";
import { AuthenticatorSetup, RecoveryCodes } from "../auth/authenticator-setup";
import { useConfirmed } from "../auth/confirm-access";
import { NewPasswordFields } from "../auth/fields";
import { ConnectedAccounts } from "./connected-accounts";

export interface AccountProps {
  name: string;
  email: string;
  role: Role;
  demo: boolean;
  requiresAuthenticator: boolean;
  hasPassword: boolean;
  passwordChangedAt: string | null;
  authenticatorSince: string | null;
  recoveryCodesLeft: number | null;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex max-w-2xl flex-col gap-3 border-t pt-6">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function AccountView(props: AccountProps) {
  const t = useTranslations("account");
  const tr = useTranslations("roles");
  const tc = useTranslations("setup");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [savingLanguage, startLanguage] = useTransition();
  const [savingPassword, startPassword] = useTransition();
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordKey, setPasswordKey] = useState(0);
  const [settingUp, setSettingUp] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [makingCodes, startCodes] = useTransition();
  const [leaving, leave] = useTransition();
  const confirmed = useConfirmed();
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{t("eyebrow")}</p>
        <h1 className="text-[28px] leading-9 font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm">{props.name}</p>
        <p className="text-sm text-muted-foreground">{t("who", { email: props.email, role: tr(`${props.role}.name`) })}</p>
        {props.demo && <p className="text-sm text-muted-foreground">{t("demoNote")}</p>}
      </header>

      <Section id={`${id}-language`} title={t("languageTitle")}>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-language-select`}>{t("language")}</Label>
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
            className="w-56"
            data-testid="language"
          >
            <NativeSelectOption value="en" lang="en">
              English
            </NativeSelectOption>
            <NativeSelectOption value="es" lang="es">
              Español
            </NativeSelectOption>
          </NativeSelect>
          <p id={`${id}-language-hint`} className="text-xs text-muted-foreground">
            {t("languageHint")}
          </p>
        </div>
      </Section>

      <Section id={`${id}-password`} title={t("passwordTitle")}>
        <p className="text-sm text-muted-foreground">{props.passwordChangedAt ? t("passwordChanged", { date: when(props.passwordChangedAt) }) : t("passwordNever")}</p>
        <div className="max-w-sm">
          <NewPasswordFields
            key={passwordKey}
            email={props.email}
            pending={savingPassword}
            submitLabel={props.hasPassword ? t("update") : t("set")}
            pendingLabel={t("saving")}
            serverError={passwordError}
            currentField={props.hasPassword ? { label: t("current") } : undefined}
            labels={{ password: t("new"), confirm: t("confirm") }}
            onSubmit={(next, current) =>
              startPassword(async () => {
                const r = await changePasswordAction(current, next);
                if (r.ok) {
                  setPasswordError(null);
                  setPasswordKey((k) => k + 1);
                  toast.success(t("passwordSaved"));
                  router.refresh();
                } else setPasswordError(r.error);
              })
            }
          />
        </div>
      </Section>

      <Section id={`${id}-auth`} title={t("authTitle")}>
        {settingUp ? (
          <AuthenticatorSetup
            email={props.email}
            onCancel={() => setSettingUp(false)}
            onFinished={() => {
              setSettingUp(false);
              router.refresh();
            }}
          />
        ) : props.authenticatorSince ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm" data-testid="authenticator-on">
              {t("authOn", { date: when(props.authenticatorSince) })}
            </p>
            <div className="flex flex-col gap-2">
              <h3 className="font-medium">{t("recoveryTitle")}</h3>
              <p className="text-sm text-muted-foreground" data-testid="recovery-left">
                {t("recoveryLeft", { count: props.recoveryCodesLeft ?? 0 })}
              </p>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="outline" size="sm" className="w-fit" disabled={makingCodes} />}>{t("newCodes")}</AlertDialogTrigger>
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
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="w-fit" onClick={() => setSettingUp(true)} data-testid="set-up-again">
                {t("setUpAgain")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("setUpAgainHint")}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {t("authOff")} {props.requiresAuthenticator && t("authRequired")}
            </p>
            <Button className="w-fit" onClick={() => setSettingUp(true)} data-testid="set-up-authenticator">
              {t("setUp")}
            </Button>
          </div>
        )}
      </Section>
      {/* Sign-in methods: passkeys (decision 0032) go here. */}
      <ConnectedAccounts />

      <div className="border-t pt-6">
        <Button variant="outline" disabled={leaving} onClick={() => leave(() => signOutAction())} data-testid="account-sign-out">
          {t("signOut")}
        </Button>
      </div>

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
    </div>
  );
}
