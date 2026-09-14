// Input validation for every app-data server function. Safe to import from client code.
// Who is acting always comes from the session on the server, never from these inputs.
import { z } from "zod";

const batchStatuses = ["Draft", "Active", "Paused", "SoldOut", "Closed"] as const;
const orderStatuses = [
  "Pending",
  "Confirmed",
  "CancellationRequested",
  "Packed",
  "OutForDelivery",
  "Delivered",
  "Cancelled",
  "NotCollected",
] as const;
const paymentMethods = ["Cash", "bKash", "Payroll deduction"] as const;
const departments = ["Production", "Finance", "HR", "Sales", "IT", "Admin", "Procurement"] as const;
const sites = ["Head Office – Gulshan", "Savar Factory"] as const;

const id = z.string().trim().min(1).max(60);
const text = (max: number) => z.string().max(max);
const isoDate = z.string().datetime({ offset: true });
const reason = z.string().trim().min(1).max(500);
const litres = z.number().int().positive().max(100_000);
const money = z.number().nonnegative().max(100_000_000);

export const batchStatusInput = z.object({ batchNo: id, status: z.enum(batchStatuses) });

export const createBatchInput = z.object({
  batch: z.object({
    productionDate: isoDate,
    product: z.string().trim().min(1).max(100),
    producedLitres: litres,
    saleableLitres: litres,
    ratePerLitre: money,
    minOrder: litres,
    maxOrder: litres,
    employeeCap: litres,
    bookingCutoff: isoDate,
    deliveryDate: isoDate,
    deliveryWindow: text(100),
    deliveryPoints: z.array(id).min(1).max(50),
    note: text(1000),
  }),
});

export const confirmOrderInput = z.object({
  batchNo: id,
  litres,
  deliveryPointId: id,
  paymentMethod: z.enum(paymentMethods),
  collectionTime: text(100),
});

export const orderActionInput = z.object({ orderNo: id });
export const orderReasonInput = z.object({ orderNo: id, reason });

export const updateOrderInput = z.object({
  orderNo: id,
  patch: z.object({ litres: litres.optional(), status: z.enum(orderStatuses).optional() }),
  reason,
});

export const deliveryRecordInput = z.object({
  orderNo: id,
  recipientName: text(120),
  contact: text(60),
  dateTime: isoDate,
  location: text(200),
  floor: text(100),
  quantity: litres,
  receiverName: text(120),
  remarks: text(500),
});

export const collectionInput = z.object({
  orderNo: id,
  amountCollected: money,
  method: z.enum(paymentMethods),
  reference: text(120),
  date: isoDate,
});

export const saveEmployeeInput = z.object({
  employee: z.object({
    id: z.string().max(60),
    name: z.string().trim().min(1, "Name is required.").max(120),
    companyEmail: z.string().trim().email("Enter a valid company email.").max(200),
    phone: text(40),
    department: z.enum(departments),
    site: z.enum(sites),
    active: z.boolean(),
  }),
  isNew: z.boolean(),
});

export const employeeIdInput = z.object({ id });
export const employeeActiveInput = z.object({ id, active: z.boolean() });

export const saveDeliveryPointInput = z.object({
  point: z.object({
    id: z.string().max(60),
    name: z.string().trim().min(1, "Name is required.").max(120),
    address: z.string().trim().min(1, "Address is required.").max(300),
    coordinatorName: text(120),
    active: z.boolean(),
  }),
  isNew: z.boolean(),
});

export const deliveryPointActiveInput = z.object({ id, active: z.boolean() });

export const saveSettingsInput = z.object({
  settings: z.object({
    ratePerLitre: money,
    bookingCutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Cutoff must be HH:MM."),
    employeeCap: litres,
    minOrder: litres,
    deliveryWindow: text(100),
    emailAlerts: z.boolean(),
    smsAlerts: z.boolean(),
    autoClose: z.boolean(),
    terms: text(4000),
  }),
});

export type BatchStatusInput = z.infer<typeof batchStatusInput>;
export type CreateBatchInput = z.infer<typeof createBatchInput>;
export type ConfirmOrderInput = z.infer<typeof confirmOrderInput>;
export type OrderActionInput = z.infer<typeof orderActionInput>;
export type OrderReasonInput = z.infer<typeof orderReasonInput>;
export type UpdateOrderInput = z.infer<typeof updateOrderInput>;
export type DeliveryRecordInput = z.infer<typeof deliveryRecordInput>;
export type CollectionInput = z.infer<typeof collectionInput>;
export type SaveEmployeeInput = z.infer<typeof saveEmployeeInput>;
export type EmployeeIdInput = z.infer<typeof employeeIdInput>;
export type EmployeeActiveInput = z.infer<typeof employeeActiveInput>;
export type SaveDeliveryPointInput = z.infer<typeof saveDeliveryPointInput>;
export type DeliveryPointActiveInput = z.infer<typeof deliveryPointActiveInput>;
export type SaveSettingsInput = z.infer<typeof saveSettingsInput>;
