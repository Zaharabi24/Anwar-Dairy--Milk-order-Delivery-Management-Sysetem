export type Role =
  | "Employee"
  | "Factory Operator"
  | "Head Office Coordinator"
  | "System Admin"
  | "Super Admin";

export type Department =
  | "Production"
  | "Finance"
  | "HR"
  | "Sales"
  | "IT"
  | "Admin"
  | "Procurement";

export type Site = "Head Office – Gulshan" | "Savar Factory";

export interface Employee {
  id: string;
  name: string;
  companyEmail: string;
  phone: string;
  department: Department;
  site: Site;
  active: boolean;
}

export type BatchStatus = "Draft" | "Active" | "Paused" | "SoldOut" | "Closed";

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
