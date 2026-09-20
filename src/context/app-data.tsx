import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  addDeliveryRecordFn,
  approveCancellationFn,
  approveOrderFn,
  cancelOrderFn,
  confirmOrderFn,
  createBatchFn,
  deleteEmployeeFn,
  getAppSnapshot,
  markNotificationsReadFn,
  rejectCancellationFn,
  requestCancellationFn,
  saveDeliveryPointFn,
  saveEmployeeFn,
  saveSettingsFn,
  setBatchStatusFn,
  setDeliveryPointActiveFn,
  setEmployeeActiveFn,
  updateOrderFn,
  upsertCollectionFn,
} from "@/functions/app-data.functions";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABEL, SIGNIN_ROLES } from "@/lib/auth-constants";
import type {
  AppNotification,
  AppSettings,
  AppSnapshot,
  AuditLog,
  BatchStatus,
  BatchTotals,
  CancellationRequest,
  CollectionRecord,
  DailyMilkBatch,
  DeliveryPoint,
  DeliveryRecord,
  BusinessUnit,
  Employee,
  Order,
  PaymentMethod,
  Role,
} from "@/lib/types";

type NewBatch = Omit<DailyMilkBatch, "batchNo" | "status">;

/** The signed-in employee books for themselves; the server takes their ID from the session. */
interface NewOrder {
  batchNo: string;
  litres: number;
  deliveryPointId: string;
  paymentMethod: PaymentMethod;
  collectionTime: string;
}

interface CollectionEntry {
  orderNo: string;
  amountCollected: number;
  method: PaymentMethod;
  reference: string;
  date: string;
}

interface AppData {
  /** The signed-in user's active role. */
  role: Role;
  /** Roles the signed-in user holds, as loaded from the database. */
  roles: Role[];
  /** Switches the active role (validated on the server against held roles). */
  setRole: (r: Role) => void;
  currentEmployee: Employee;
  employees: Employee[];
  businessUnits: BusinessUnit[];
  batches: DailyMilkBatch[];
  batchTotals: Record<string, BatchTotals>;
  activeBatch: DailyMilkBatch | undefined;
  deliveryPoints: DeliveryPoint[];
  orders: Order[];
  deliveryRecords: DeliveryRecord[];
  collections: CollectionRecord[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
  settings: AppSettings;
  unreadCount: number;
  /** Re-reads everything from the database. */
  refresh: () => Promise<void>;
  markNotificationsRead: () => void;
  remainingLitres: (batchNo: string) => number;
  setBatchStatus: (batchNo: string, status: BatchStatus) => void;
  /** Saves a draft batch; the database assigns the batch number. */
  addBatch: (batch: NewBatch) => Promise<DailyMilkBatch | null>;
  confirmOrder: (input: NewOrder) => Promise<Order | null>;
  approveOrder: (orderNo: string) => void;
  cancelOrder: (orderNo: string, reason: string) => void;
  cancellationRequests: CancellationRequest[];
  cancellationRequestFor: (orderNo: string) => CancellationRequest | undefined;
  requestCancellation: (orderNo: string) => void;
  approveCancellation: (orderNo: string) => void;
  rejectCancellation: (orderNo: string, reason: string) => void;
  updateOrder: (
    orderNo: string,
    patch: Pick<Partial<Order>, "litres" | "status">,
    reason: string,
  ) => void;
  /** The database assigns the coupon number. */
  addDeliveryRecord: (record: Omit<DeliveryRecord, "couponNo">) => void;
  /** Records a payment; the amount due and status are worked out on the server. */
  upsertCollection: (record: CollectionEntry) => Promise<boolean>;
  saveEmployee: (employee: Employee, isNew: boolean) => Promise<Employee | null>;
  deleteEmployee: (id: string) => Promise<boolean>;
  setEmployeeActive: (id: string, active: boolean) => Promise<boolean>;
  saveDeliveryPoint: (point: DeliveryPoint, isNew: boolean) => Promise<DeliveryPoint | null>;
  setDeliveryPointActive: (id: string, active: boolean) => Promise<boolean>;
  saveSettings: (settings: AppSettings) => Promise<boolean>;
}

const Ctx = createContext<AppData | null>(null);

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  // Validation failures arrive as a JSON list of issues; show the first readable one.
  if (message.startsWith("[")) {
    try {
      const issues = JSON.parse(message) as Array<{ message?: string }>;
      if (issues[0]?.message) return issues[0].message;
    } catch {
      // fall through
    }
    return "Some values are invalid.";
  }
  return message || "Something went wrong. Please try again.";
}

const ok = async (call: Promise<{ snapshot: AppSnapshot }>) => ({ ...(await call), result: true });

export function AppDataProvider({
  initialSnapshot,
  children,
}: {
  initialSnapshot: AppSnapshot;
  children: ReactNode;
}) {
  const { user, switchRole } = useAuth();
  const [snapshot, setSnapshot] = useState<AppSnapshot>(initialSnapshot);

  // Snapshots can arrive out of order (loader refreshes, mutations); keep the newest.
  const accept = useCallback((next: AppSnapshot) => {
    setSnapshot((prev) => (next.version >= prev.version ? next : prev));
  }, []);

  // The /app loader re-runs on navigation; adopt what it brings back.
  useEffect(() => accept(initialSnapshot), [accept, initialSnapshot]);

  const refresh = useCallback(async () => {
    try {
      accept(await getAppSnapshot());
    } catch (error) {
      console.error(error);
    }
  }, [accept]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Writes run one at a time, in the order they were made, so a page that fires
  // two changes back to back (e.g. deliver + coupon) reaches the server in order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const run = useCallback(
    <T,>(call: () => Promise<{ result: T; snapshot: AppSnapshot }>, fallback: T): Promise<T> => {
      const task = queue.current.then(async () => {
        try {
          const { result, snapshot: next } = await call();
          accept(next);
          return result;
        } catch (error) {
          toast.error(errorMessage(error));
          void refresh();
          return fallback;
        }
      });
      queue.current = task.catch(() => undefined);
      return task;
    },
    [accept, refresh],
  );

  const { employees, batches, orders, cancellationRequests, notifications } = snapshot;

  const role: Role = user ? ROLE_LABEL[user.activeRole] : "Employee";
  const roles = useMemo(() => (user?.roles ?? []).map((r) => ROLE_LABEL[r]), [user]);

  const currentEmployee = useMemo<Employee>(
    () =>
      employees.find((e) => e.id === user?.employeeId) ?? {
        id: user?.employeeId ?? "—",
        name: user?.fullName ?? "Unknown",
        companyEmail: user?.companyMail ?? "",
        phone: "",
        department: "",
        designation: "",
        site: "Head Office",
        businessUnitCode: null,
        active: false,
      },
    [employees, user],
  );

  const setRole = useCallback(
    (label: Role) => {
      const value = SIGNIN_ROLES.find((r) => r.label === label)?.value;
      if (!value) return;
      void switchRole(value).then((result) => {
        if (!result.ok) toast.error(result.message ?? "Couldn't switch role.");
      });
    },
    [switchRole],
  );

  const remainingLitres = useCallback(
    (batchNo: string) => {
      const batch = batches.find((b) => b.batchNo === batchNo);
      if (!batch) return 0;
      const booked = orders
        .filter((o) => o.batchNo === batchNo && o.status !== "Cancelled")
        .reduce((sum, o) => sum + o.litres, 0);
      return Math.max(0, batch.saleableLitres - booked);
    },
    [batches, orders],
  );

  const cancellationRequestFor = useCallback(
    (orderNo: string) =>
      cancellationRequests
        .filter((r) => r.orderNo === orderNo)
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0],
    [cancellationRequests],
  );

  const actions = useMemo(
    () => ({
      markNotificationsRead: () => void run(() => markNotificationsReadFn(), undefined),
      setBatchStatus: (batchNo: string, status: BatchStatus) =>
        void run(() => setBatchStatusFn({ data: { batchNo, status } }), undefined),
      addBatch: (batch: NewBatch) => run(() => createBatchFn({ data: { batch } }), null),
      confirmOrder: (input: NewOrder) => run(() => confirmOrderFn({ data: input }), null),
      approveOrder: (orderNo: string) =>
        void run(() => approveOrderFn({ data: { orderNo } }), undefined),
      cancelOrder: (orderNo: string, reason: string) =>
        void run(() => cancelOrderFn({ data: { orderNo, reason } }), undefined),
      requestCancellation: (orderNo: string) =>
        void run(() => requestCancellationFn({ data: { orderNo } }), undefined),
      approveCancellation: (orderNo: string) =>
        void run(() => approveCancellationFn({ data: { orderNo } }), undefined),
      rejectCancellation: (orderNo: string, reason: string) =>
        void run(() => rejectCancellationFn({ data: { orderNo, reason } }), undefined),
      updateOrder: (
        orderNo: string,
        patch: Pick<Partial<Order>, "litres" | "status">,
        reason: string,
      ) =>
        void run(
          () =>
            updateOrderFn({
              data: {
                orderNo,
                patch: {
                  ...(patch.litres !== undefined ? { litres: patch.litres } : {}),
                  ...(patch.status !== undefined ? { status: patch.status } : {}),
                },
                reason,
              },
            }),
          undefined,
        ),
      addDeliveryRecord: (record: Omit<DeliveryRecord, "couponNo">) =>
        void run(() => addDeliveryRecordFn({ data: record }), null),
      upsertCollection: (record: CollectionEntry) =>
        run(() => ok(upsertCollectionFn({ data: record })), false),
      saveEmployee: (employee: Employee, isNew: boolean) =>
        run(
          () =>
            saveEmployeeFn({
              data: {
                employee: { ...employee, businessUnitCode: employee.businessUnitCode ?? "" },
                isNew,
              },
            }),
          null,
        ),
      deleteEmployee: (id: string) => run(() => ok(deleteEmployeeFn({ data: { id } })), false),
      setEmployeeActive: (id: string, active: boolean) =>
        run(() => ok(setEmployeeActiveFn({ data: { id, active } })), false),
      saveDeliveryPoint: (point: DeliveryPoint, isNew: boolean) =>
        run(() => saveDeliveryPointFn({ data: { point, isNew } }), null),
      setDeliveryPointActive: (id: string, active: boolean) =>
        run(() => ok(setDeliveryPointActiveFn({ data: { id, active } })), false),
      saveSettings: (settings: AppSettings) =>
        run(() => ok(saveSettingsFn({ data: { settings } })), false),
    }),
    [run],
  );

  const value = useMemo<AppData>(
    () => ({
      role,
      roles,
      setRole,
      currentEmployee,
      employees,
      batches,
      batchTotals: snapshot.batchTotals,
      activeBatch: batches.find((b) => b.status === "Active" || b.status === "Paused"),
      businessUnits: snapshot.businessUnits,
      deliveryPoints: snapshot.deliveryPoints,
      orders,
      deliveryRecords: snapshot.deliveryRecords,
      collections: snapshot.collections,
      auditLogs: snapshot.auditLogs,
      notifications,
      settings: snapshot.settings,
      unreadCount: notifications.filter((n) => !n.read).length,
      refresh,
      remainingLitres,
      cancellationRequests,
      cancellationRequestFor,
      ...actions,
    }),
    [
      role,
      roles,
      setRole,
      currentEmployee,
      employees,
      batches,
      snapshot,
      orders,
      notifications,
      refresh,
      remainingLitres,
      cancellationRequests,
      cancellationRequestFor,
      actions,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}
