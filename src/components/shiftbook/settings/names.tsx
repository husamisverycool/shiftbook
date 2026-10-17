"use client";

// Settings › Names (docs/patterns/settings/names.md): Linear's label list — a section with its add
// action at the heading's right, an add row in the panel, and one row per nickname with Remove.
import { PlusIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addNicknameAction, removeNicknameAction } from "@/app/[locale]/(app)/settings/names/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import type { Nickname } from "@/server/intake/nicknames";
import { ReadOnlyNote, useCan } from "../abilities";
import { SettingsEmpty, SettingsPage, SettingsRow, SettingsRows, SettingsSection } from "../settings-panel";
import { Tip } from "../tip";

export function NamesSettings({ nicknames }: { nicknames: Nickname[] }) {
  const t = useTranslations("names");
  const tc = useTranslations("common");
  const router = useRouter();
  const mayChange = useCan()("hours");
  const [adding, setAdding] = useState(false);
  const [nickname, setNickname] = useState("");
  const [given, setGiven] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const r = await addNicknameAction(nickname, given);
      if ("error" in r) return setProblem(t(`problems.${r.error}`));
      setProblem(null);
      setNickname("");
      setGiven("");
      setAdding(false);
      toast.success(t("added"));
      router.refresh();
    });
  const remove = (n: Nickname) =>
    start(async () => {
      const r = await removeNicknameAction(n.id);
      if (r.ok) toast.success(t("removed", { nickname: n.nickname }));
      router.refresh();
    });

  return (
    <SettingsPage title={t("title")} description={mayChange ? t("description") : <ReadOnlyNote text={t("readOnly")} />}>
      <SettingsSection
        title={t("section")}
        description={t("sectionBody")}
        testId="nicknames"
        action={
          mayChange && !adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="add-nickname">
              <PlusIcon />
              {t("add")}
            </Button>
          ) : undefined
        }
      >
        <SettingsRows as="ul" testId="nickname-list">
          {adding && (
            <li className="flex flex-col gap-3 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nickname">{t("nickname")}</Label>
                  <Input id="nickname" value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} placeholder={t("nicknamePlaceholder")} autoFocus data-testid="nickname-input" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="given-name">{t("standsFor")}</Label>
                  <Input id="given-name" value={given} maxLength={40} onChange={(e) => setGiven(e.target.value)} placeholder={t("givenPlaceholder")} data-testid="given-input" />
                </div>
              </div>
              {problem && (
                <p className="text-sm text-destructive" role="alert">
                  {problem}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAdding(false);
                    setProblem(null);
                  }}
                >
                  {tc("cancel")}
                </Button>
                <Button size="sm" onClick={add} disabled={nickname.trim() === "" || given.trim() === ""} loading={pending} loadingLabel={tc("loading")} data-testid="save-nickname">
                  {tc("save")}
                </Button>
              </div>
            </li>
          )}
          {nicknames.length === 0 && !adding ? (
            <SettingsEmpty as="li">{t("empty")}</SettingsEmpty>
          ) : (
            nicknames.map((n) => (
              <SettingsRow
                as="li"
                key={n.id}
                label={n.nickname}
                description={t("standsForValue", { given: n.givenName })}
                testId="nickname-row"
                control={
                  mayChange ? (
                    <Tip label={t("remove", { nickname: n.nickname })}>
                      <Button size="icon-sm" variant="ghost" aria-label={t("remove", { nickname: n.nickname })} onClick={() => remove(n)} disabled={pending} data-testid="remove-nickname">
                        <XIcon />
                      </Button>
                    </Tip>
                  ) : undefined
                }
              />
            ))
          )}
        </SettingsRows>
      </SettingsSection>
    </SettingsPage>
  );
}
