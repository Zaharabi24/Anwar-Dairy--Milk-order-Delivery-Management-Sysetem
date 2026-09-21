export type Role =
  "Employee" | "Factory Operator" | "Head Office Coordinator" | "System Admin" | "Super Admin";

/**
 * Department and location are open text, not fixed lists.
 *
 * The Employee Database carries thirty-six departments and gains more as the group reorganises,
 * so a closed list here would mean a schema change every time HR names a new one. The screens
 * offer what is already in use as suggestions, which keeps entry consistent without the system
 * refusing a department that genuinely exists.
 */
export type Department = string;

export type Site = string;

/** One person in the Employee Database, in the columns the directory is kept in. */
export interface Employee {
  id: string;
  name: string;
  companyEmail: string;
  phone: string;
  department: Department;
  designation: string;
  /** The directory's Location column. */
  site: Site;
  /** Chosen when the account was requested. Null for anyone added straight to the directory. */
  businessUnitCode: string | null;
  /** Inactive means never mailed when a batch is published, and no link that still works. */
  active: boolean;
}

/** A business unit, as held in the business_units table. */
export interface BusinessUnit {
  code: string;
  name: string;
}

export type BatchStatus = "Draft" | "Active" | "Paused" | "SoldOut" | "Closed";

/** Who a batch is announced to when it is published. */
export type BatchAudience = "all" | "selected";

export interface DailyMilkBatch {
  batchNo: string;
  productionDate: string;
  product: string;
  producedLitres: number;
  saleableLitres: number;
  ratePerLitre: number;
  minOrder: number;
  maxOrder: number;
  employeeCap: number;
  bookingCutoff: string;
  deliveryDate: string;
  deliveryWindow: string;
  deliveryPoints: string[];
  note: string;
  status: BatchStatus;
  /** Everyone in the Employee Database, or the people the operator chose. */
  audience: BatchAudience;
  /** The chosen recipients when `audience` is "selected"; empty otherwise. */
  recipientIds: string[];
}

export interface DeliveryPoint {
  id: string;
  name: string;
  address: string;
  coordinatorName: string;
  active: boolean;
}

export type OrderStatus =
  | "Pending"
  | "Confirmed"
  | "CancellationRequested"
  | "Packed"
  | "OutForDelivery"
  | "Delivered"
  | "Cancelled"
  | "NotCollected";

export type CancellationRequestStatus = "Pending" | "Approved" | "Rejected";

export interface CancellationRequest {
  requestNo: string;
  orderNo: string;
  employeeId: string;
  requestedAt: string;
  status: CancellationRequestStatus;
  decidedAt?: string;
  decidedBy?: string;
  rejectionReason?: string;
}

export type PaymentMethod = "Cash" | "bKash" | "Payroll deduction";

export interface Order {
  orderNo: string;
  employeeId: string;
  batchNo: string;
  litres: number;
  rate: number;
  amount: number;
  deliveryPointId: string;
  status: OrderStatus;
  createdAt: string;
  /** When the status last changed, for the order's history. */
  updatedAt: string;
  paymentMethod?: PaymentMethod;
  collectionTime?: string;
}

export interface DeliveryRecord {
  couponNo: string;
  orderNo: string;
  recipientName: string;
  contact: string;
  dateTime: string;
  location: string;
  floor: string;
  quantity: number;
  receiverName: string;
  remarks: string;
}

export type NotificationKind =
  | "BatchPublished"
  | "CutoffReminder"
  | "OrderRequest"
  | "CancellationRequested"
  | "CancellationApproved"
  | "CancellationRejected"
  | "OrderConfirmed"
  | "OrderCancelled"
  | "OutForDelivery"
  | "PaymentDue";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  audience: Role | "All";
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export interface CollectionRecord {
  orderNo: string;
  amountDue: number;
  amountCollected: number;
  method: PaymentMethod;
  reference: string;
  status: "Paid" | "Unpaid" | "Partial";
  collectorName: string;
  date: string;
}

export interface AuditLog {
  id: string;
  user: string;
  action: string;
  record: string;
  oldValue: string;
  newValue: string;
  timestamp: string;
}

export interface AppSettings {
  ratePerLitre: number;
  bookingCutoff: string; // HH:MM
  employeeCap: number;
  minOrder: number;
  deliveryWindow: string;
  emailAlerts: boolean;
  smsAlerts: boolean;
  autoClose: boolean;
  terms: string;
}

export interface BatchTotals {
  booked: number;
  delivered: number;
}

/** Everything the app screens read, loaded from PostgreSQL in one consistent read. */
export interface AppSnapshot {
  /** Database clock (µs) when the snapshot was read; newer snapshots win. */
  version: number;
  employees: Employee[];
  businessUnits: BusinessUnit[];
  batches: DailyMilkBatch[];
  /** Final booked/delivered litres, recorded when a batch is closed. */
  batchTotals: Record<string, BatchTotals>;
  deliveryPoints: DeliveryPoint[];
  orders: Order[];
  cancellationRequests: CancellationRequest[];
  deliveryRecords: DeliveryRecord[];
  collections: CollectionRecord[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
  settings: AppSettings;
}
