import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { useAppData } from "@/context/app-data";
import type { Employee } from "@/lib/types";

export const Route = createFileRoute("/app/admin/employees")({
  head: () => ({
    meta: [
      { title: "Employee Database — Anwar Organic" },
      {
        name: "description",
        content:
          "The company directory the daily batch email goes to. Add, edit, activate and deactivate employees.",
      },
      { property: "og:title", content: "Employee Database — Anwar Organic" },
      {
        property: "og:description",
        content: "Manage who is told about the daily batch and who can book from it.",
      },
    ],
  }),
  component: EmployeeDatabasePage,
});

const blank: Employee = {
  id: "",
  name: "",
  companyEmail: "",
  phone: "",
  department: "",
  designation: "",
  site: "Head Office",
  businessUnitCode: null,
  active: true,
};

/** The values already in use, offered as suggestions so entry stays consistent without a fixed list. */
function suggestions(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function EmployeeDatabasePage() {
  const { employees, businessUnits, saveEmployee, deleteEmployee, setEmployeeActive } =
    useAppData();
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState("all");
  const [department, setDepartment] = useState("all");
  const [location, setLocation] = useState("all");
  const [status, setStatus] = useState("all");
  const [draft, setDraft] = useState<Employee | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);

  // Names come from the business_units table, so a unit renamed there is renamed here.
  const unitName = (code: string | null) => businessUnits.find((u) => u.code === code)?.name ?? "—";

  const departments = useMemo(() => suggestions(employees.map((e) => e.department)), [employees]);
  const designations = useMemo(() => suggestions(employees.map((e) => e.designation)), [employees]);
  const locations = useMemo(() => suggestions(employees.map((e) => e.site)), [employees]);

  // An address on two records is not an error -- two people in the directory really do share one --
  // but it means one of them won't be mailed, so the row says so rather than leaving it to be found.
  const sharedAddresses = useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of employees) {
      const key = e.companyEmail.trim().toLowerCase();
      if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [employees]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => (unit === "all" ? true : (e.businessUnitCode ?? "") === unit))
      .filter((e) => (department === "all" ? true : e.department === department))
      .filter((e) => (location === "all" ? true : e.site === location))
      .filter((e) => (status === "all" ? true : status === "active" ? e.active : !e.active))
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.companyEmail.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q) ||
          e.designation.toLowerCase().includes(q) ||
          e.phone.toLowerCase().includes(q),
      );
  }, [employees, query, unit, department, location, status]);

  const mailable = employees.filter((e) => e.active && e.companyEmail.trim()).length;

  async function remove() {
    const emp = pendingDelete;
    if (!emp) return;
    setPendingDelete(null);
    if (await deleteEmployee(emp.id)) toast.success(`${emp.name} deleted`);
  }

  async function toggleActive(emp: Employee) {
    if (await setEmployeeActive(emp.id, !emp.active)) {
      toast.success(`${emp.name} ${emp.active ? "deactivated" : "activated"}`);
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (isNew && !draft.id.trim()) {
      toast.error("Employee ID is required.");
      return;
    }
    const saved = await saveEmployee(draft, isNew);
    if (!saved) return;
    toast.success(`${saved.name} ${isNew ? "added" : "updated"}`);
    setDraft(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Employee Database"
        description="The company directory. Everyone active here is emailed when a batch is published, and can book from it."
        action={
          <Button
            onClick={() => {
              setDraft(blank);
              setIsNew(true);
            }}
          >
            Add employee
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="In the directory" value={employees.length} />
        <StatCard label="Active" value={employees.filter((e) => e.active).length} emphasis />
        <StatCard label="Inactive" value={employees.filter((e) => !e.active).length} />
        <StatCard label="Reachable by email" value={mailable} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search name, ID, email, department"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Business unit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All business units</SelectItem>
            {businessUnits.map((u) => (
              <SelectItem key={u.code} value={u.code}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Showing {rows.length} of {employees.length}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No employees match" hint="Try clearing the filters." />
          </div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>Employee ID</Th>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Contact</Th>
                <Th>Location</Th>
                <Th>Active</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <motion.tr
                  key={e.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.01, 0.2) }}
                  className="border-b border-border/60 last:border-0"
                >
                  <Td className="font-medium">{e.id}</Td>
                  <Td>
                    {e.name}
                    <span className="block text-xs text-muted-foreground">
                      {e.designation || "—"}
                    </span>
                  </Td>
                  <Td>
                    {e.department || "—"}
                    <span className="block text-xs text-muted-foreground">
                      {unitName(e.businessUnitCode)}
                    </span>
                  </Td>
                  <Td>
                    {e.companyEmail ? (
                      <>
                        {e.companyEmail}
                        {sharedAddresses.has(e.companyEmail.trim().toLowerCase()) ? (
                          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            shared address
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">No email on file</span>
                    )}
                    <span className="block text-xs text-muted-foreground">{e.phone || "—"}</span>
                  </Td>
                  <Td>{e.site || "—"}</Td>
                  <Td>
                    <Switch checked={e.active} onCheckedChange={() => toggleActive(e)} />
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDraft(e);
                          setIsNew(false);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setPendingDelete(e)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Suggestions for the free-text fields, shared by every row's form. */}
      <datalist id="department-options">
        {departments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <datalist id="designation-options">
        {designations.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <datalist id="location-options">
        {locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add employee" : `Edit ${draft?.name}`}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block">Full name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Employee ID</Label>
                  <Input
                    value={draft.id}
                    disabled={!isNew}
                    placeholder="e.g. 019258"
                    onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  />
                  {!isNew ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      The ID identifies this person everywhere and can't be changed here.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block">Company email</Label>
                  <Input
                    value={draft.companyEmail}
                    onChange={(e) => setDraft({ ...draft, companyEmail: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Where the batch email goes. Without one this person can't be mailed.
                  </p>
                </div>
                <div>
                  <Label className="mb-2 block">Official phone number</Label>
                  <Input
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block">Department</Label>
                  <Input
                    list="department-options"
                    value={draft.department}
                    onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Designation</Label>
                  <Input
                    list="designation-options"
                    value={draft.designation}
                    onChange={(e) => setDraft({ ...draft, designation: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Location</Label>
                  <Input
                    list="location-options"
                    value={draft.site}
                    onChange={(e) => setDraft({ ...draft, site: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Business Unit</Label>
                  <Select
                    value={draft.businessUnitCode ?? "none"}
                    onValueChange={(v) =>
                      setDraft({ ...draft, businessUnitCode: v === "none" ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Someone added straight to the directory may not belong to one yet. */}
                      <SelectItem value="none">Not set</SelectItem>
                      {businessUnits.map((u) => (
                        <SelectItem key={u.code} value={u.code}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div>
                  <Label className="block">Active</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inactive employees are never emailed when a batch is published.
                  </p>
                </div>
                <Switch
                  checked={draft.active}
                  onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="sm:justify-between">
            {!isNew && draft ? (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  const target = draft;
                  setDraft(null);
                  setPendingDelete(target);
                }}
              >
                Delete employee
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes {pendingDelete?.name} ({pendingDelete?.id}) from the Employee Database.
            Past orders and records stay in the system. To stop the batch email reaching someone who
            has left, deactivating them is usually the better move.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Keep employee
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={remove}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
