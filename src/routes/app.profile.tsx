import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminList } from "@/components/admin/account-ui";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { roleLabel } from "@/lib/auth-constants";
import { dateTime } from "@/lib/format";
import { authService } from "@/services/auth-service";

export const Route = createFileRoute("/app/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Anwar Organic" },
      { name: "description", content: "Your personal and account details." },
    ],
  }),
  component: ProfilePage,
});

const statusLabel = {
  active: "Active",
  awaiting_password: "Awaiting password",
  suspended: "Suspended",
  deactivated: "Deactivated",
} as const;

function ProfilePage() {
  const load = useCallback(() => authService.myProfile(), []);
  const { data: profile, error, loading, reload } = useAdminList(load);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // The form starts from what's on file, and follows it if the profile is reloaded.
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName);
    setPhone(profile.phone);
  }, [profile]);

  const dirty = !!profile && (fullName !== profile.fullName || phone !== profile.phone);

  async function save() {
    setSaving(true);
    setErrors({});
    const result = await authService.updateProfile({ full_name: fullName, phone });
    setSaving(false);
    if (!result.ok) {
      if (result.errors) setErrors(result.errors);
      toast.error(result.message ?? "We couldn't save your profile.");
      return;
    }
    toast.success(result.message ?? "Your profile was saved.");
    await reload();
  }

  if (loading && !profile) return <Skeleton className="mx-auto h-96 w-full max-w-3xl rounded-xl" />;
  if (error || !profile) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title="Profile" />
        <EmptyState title="Couldn't load your profile" {...(error ? { hint: error } : {})} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Profile"
        description="Your personal and account details."
        action={
          <Button asChild variant="outline">
            <Link to="/app/security">Privacy &amp; security</Link>
          </Button>
        }
      />

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-bold">Your details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These are the parts of your profile you can change yourself.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setErrors((p) => ({ ...p, full_name: "" }));
              }}
              className={errors["full_name"] ? "border-destructive" : ""}
            />
            {errors["full_name"] ? (
              <p className="text-xs text-destructive">{errors["full_name"]}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              placeholder="01XXXXXXXXX"
              onChange={(e) => {
                setPhone(e.target.value);
                setErrors((p) => ({ ...p, phone: "" }));
              }}
              className={errors["phone"] ? "border-destructive" : ""}
            />
            {errors["phone"] ? <p className="text-xs text-destructive">{errors["phone"]}</p> : null}
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
          {dirty ? <span className="text-sm text-muted-foreground">Unsaved changes</span> : null}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-base font-bold">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Held by HR and your administrators. Ask them if any of it is wrong.
        </p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Employee ID" value={profile.employeeId} />
          <Field label="Company email" value={profile.companyMail} />
          <Field label="Site" value={profile.site} />
          <Field label="Business unit" value={profile.businessUnitName ?? "—"} />
          <Field label="Office" value={profile.officeName ?? "—"} />
          <div>
            <dt className="text-sm text-muted-foreground">Roles</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {profile.roles.map((r) => (
                <Badge key={r} variant="secondary" className="font-normal">
                  {roleLabel(r)}
                </Badge>
              ))}
            </dd>
          </div>
          <Field label="Account status" value={statusLabel[profile.status]} />
          <Field label="Member since" value={dateTime(profile.memberSince)} />
          <Field
            label="Last sign-in"
            value={profile.lastLoginAt ? dateTime(profile.lastLoginAt) : "—"}
          />
        </dl>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words">{value}</dd>
    </div>
  );
}
