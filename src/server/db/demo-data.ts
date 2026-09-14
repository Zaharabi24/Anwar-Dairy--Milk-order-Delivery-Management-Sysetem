import type {
  AppNotification,
  AuditLog,
  CollectionRecord,
  DailyMilkBatch,
  DeliveryPoint,
  DeliveryRecord,
  Employee,
  Order,
  OrderStatus,
} from "@/lib/types";

export const deliveryPoints: DeliveryPoint[] = [
  {
    id: "dp-gulshan",
    name: "Head Office – Gulshan",
    address: "Ground floor lobby, Anwar Tower, Gulshan Avenue",
    coordinatorName: "Nusrat Jahan",
    active: true,
  },
  {
    id: "dp-savar",
    name: "Factory Gate – Savar",
    address: "Gate 2 security desk, Savar dairy unit",
    coordinatorName: "Kamal Hossain",
    active: true,
  },
  {
    id: "dp-ctg",
    name: "Regional Office – Chattogram",
    address: "Reception, Agrabad C/A",
    coordinatorName: "Imran Kabir",
    active: true,
  },
  {
    id: "dp-ashulia",
    name: "Depot – Ashulia",
    address: "Cold store counter, Ashulia depot",
    coordinatorName: "Sultana Razia",
    active: true,
  },
];

const seedNames: Array<[string, Employee["department"], Employee["site"]]> = [
  ["Rahim Uddin", "Production", "Savar Factory"],
  ["Nusrat Jahan", "Admin", "Head Office – Gulshan"],
  ["Kamal Hossain", "Production", "Savar Factory"],
  ["Fatima Akter", "Finance", "Head Office – Gulshan"],
  ["Shakil Ahmed", "IT", "Head Office – Gulshan"],
  ["Ayesha Siddika", "HR", "Head Office – Gulshan"],
  ["Tanvir Rahman", "Sales", "Head Office – Gulshan"],
  ["Sultana Razia", "Procurement", "Savar Factory"],
  ["Imran Kabir", "Sales", "Head Office – Gulshan"],
  ["Mahmuda Khatun", "Finance", "Head Office – Gulshan"],
  ["Arif Chowdhury", "Production", "Savar Factory"],
  ["Sharmin Sultana", "HR", "Savar Factory"],
  ["Jahidul Islam", "IT", "Savar Factory"],
  ["Nazmul Haque", "Procurement", "Head Office – Gulshan"],
  ["Rubina Yasmin", "Admin", "Head Office – Gulshan"],
  ["Sabbir Alam", "Production", "Savar Factory"],
  ["Farhana Islam", "Sales", "Head Office – Gulshan"],
  ["Mizanur Rahman", "Production", "Savar Factory"],
  ["Taslima Begum", "HR", "Head Office – Gulshan"],
  ["Ashraful Haque", "IT", "Head Office – Gulshan"],
  ["Nadia Sharmin", "Finance", "Head Office – Gulshan"],
  ["Rezaul Karim", "Procurement", "Savar Factory"],
];

export const employees: Employee[] = seedNames.map(([name, department, site], i) => ({
  id: `EMP-${(1001 + i).toString()}`,
  name,
  companyEmail: `${name.toLowerCase().replace(/\s+/g, ".")}@anwargroup.net`,
  phone: `+88017${(10000000 + i * 371937).toString().slice(0, 8)}`,
  department,
  site,
  active: i !== 15 && i !== 20,
}));

function atOffset(daysAgo: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const ACTIVE_BATCH_NO = "BATCH-2409";

export const activeBatch: DailyMilkBatch = {
  batchNo: ACTIVE_BATCH_NO,
  productionDate: atOffset(0, 6),
  product: "Fresh Whole Milk",
  producedLitres: 640,
  saleableLitres: 600,
  ratePerLitre: 92,
  minOrder: 1,
  maxOrder: 10,
  employeeCap: 10,
  bookingCutoff: atOffset(0, 23, 30),
  deliveryDate: atOffset(-1, 16),
  deliveryWindow: "4:00 PM – 6:30 PM",
  deliveryPoints: ["dp-gulshan", "dp-savar"],
  note: "Chilled at 4°C. Please bring your own carry bag.",
  status: "Active",
};

const historyShape = [
  { produced: 620, saleable: 580, booked: 545, delivered: 528, rate: 90 },
  { produced: 660, saleable: 610, booked: 610, delivered: 596, rate: 90 },
  { produced: 585, saleable: 555, booked: 498, delivered: 490, rate: 88 },
  { produced: 700, saleable: 660, booked: 612, delivered: 601, rate: 92 },
  { produced: 640, saleable: 600, booked: 570, delivered: 552, rate: 92 },
  { produced: 610, saleable: 575, booked: 520, delivered: 511, rate: 90 },
  { produced: 675, saleable: 640, booked: 640, delivered: 625, rate: 92 },
  { produced: 595, saleable: 560, booked: 489, delivered: 478, rate: 88 },
  { produced: 655, saleable: 620, booked: 583, delivered: 572, rate: 92 },
];

export const historicalBatches: DailyMilkBatch[] = historyShape.map((h, i) => {
  const daysAgo = i + 1;
  return {
    batchNo: `BATCH-${2408 - i}`,
    productionDate: atOffset(daysAgo, 6),
    product: "Fresh Whole Milk",
    producedLitres: h.produced,
    saleableLitres: h.saleable,
    ratePerLitre: h.rate,
    minOrder: 1,
    maxOrder: 10,
    employeeCap: 10,
    bookingCutoff: atOffset(daysAgo, 13),
    deliveryDate: atOffset(daysAgo, 16),
    deliveryWindow: "4:00 PM – 6:30 PM",
    deliveryPoints: ["dp-gulshan", "dp-savar"],
    note: "Chilled at 4°C.",
    status: "Closed",
  };
});

export const batchTotals: Record<string, { booked: number; delivered: number }> =
  Object.fromEntries(
    historyShape.map((h, i) => [`BATCH-${2408 - i}`, { booked: h.booked, delivered: h.delivered }]),
  );

export const batches: DailyMilkBatch[] = [activeBatch, ...historicalBatches];

// Today's orders against the active batch
const todaySpec: Array<[number, number, string, OrderStatus, number]> = [
  [0, 4, "dp-savar", "Confirmed", 9],
  [3, 2, "dp-gulshan", "Confirmed", 9],
  [6, 6, "dp-gulshan", "Packed", 10],
  [1, 3, "dp-gulshan", "Confirmed", 10],
  [2, 5, "dp-savar", "Packed", 10],
  [4, 2, "dp-gulshan", "Confirmed", 11],
  [7, 8, "dp-savar", "OutForDelivery", 11],
  [9, 3, "dp-gulshan", "Confirmed", 11],
  [10, 4, "dp-savar", "Confirmed", 12],
  [12, 1, "dp-savar", "Confirmed", 12],
  [13, 5, "dp-gulshan", "Packed", 12],
  [14, 2, "dp-gulshan", "Confirmed", 13],
  [16, 7, "dp-gulshan", "Confirmed", 13],
  [17, 3, "dp-savar", "Pending", 14],
  [18, 2, "dp-gulshan", "Cancelled", 14],
  [19, 6, "dp-gulshan", "Pending", 15],
  [21, 4, "dp-savar", "Confirmed", 15],
];

const todayOrders: Order[] = todaySpec.map(([empIdx, litres, dp, status, hour], i) => ({
  orderNo: `ORD-${8801 + i}`,
  employeeId: employees[empIdx]!.id,
  batchNo: ACTIVE_BATCH_NO,
  litres,
  rate: activeBatch.ratePerLitre,
  amount: litres * activeBatch.ratePerLitre,
  deliveryPointId: dp,
  status,
  createdAt: atOffset(0, hour, (i * 7) % 60),
}));

// Historical orders across the last 3 closed batches
const historyOrders: Order[] = [];
let seq = 8700;
historicalBatches.slice(0, 3).forEach((batch, bi) => {
  const count = 10 + bi;
  for (let i = 0; i < count; i++) {
    const emp = employees[(i * 3 + bi) % employees.length]!;
    const litres = ((i * 2 + bi) % 8) + 1;
    const status: OrderStatus = i % 9 === 4 ? "NotCollected" : "Delivered";
    historyOrders.push({
      orderNo: `ORD-${seq++}`,
      employeeId: emp.id,
      batchNo: batch.batchNo,
      litres,
      rate: batch.ratePerLitre,
      amount: litres * batch.ratePerLitre,
      deliveryPointId: i % 2 === 0 ? "dp-gulshan" : "dp-savar",
      status,
      createdAt: atOffset(bi + 1, 9 + (i % 4), (i * 11) % 60),
    });
  }
});

export const orders: Order[] = [...todayOrders, ...historyOrders];

export const deliveryRecords: DeliveryRecord[] = historyOrders
  .filter((o) => o.status === "Delivered")
  .slice(0, 12)
  .map((o, i) => {
    const emp = employees.find((e) => e.id === o.employeeId)!;
    return {
      couponNo: `DC-${2400 + i}`,
      orderNo: o.orderNo,
      recipientName: emp.name,
      contact: emp.phone,
      dateTime: o.createdAt,
      location: deliveryPoints.find((d) => d.id === o.deliveryPointId)!.name,
      floor: o.deliveryPointId === "dp-gulshan" ? `Floor ${3 + (i % 6)}` : "Factory store",
      quantity: o.litres,
      receiverName: emp.name,
      remarks: "Collected on time",
    };
  });

const methods: CollectionRecord["method"][] = ["Cash", "bKash", "Payroll deduction"];

export const collections: CollectionRecord[] = historyOrders
  .filter((o) => o.status === "Delivered")
  .map((o, i) => {
    const paidFully = i % 5 !== 0;
    const partial = i % 5 === 0 && i % 10 !== 0;
    return {
      orderNo: o.orderNo,
      amountDue: o.amount,
      amountCollected: paidFully ? o.amount : partial ? Math.round(o.amount / 2) : 0,
      method: methods[i % 3]!,
      reference: `REF-${4100 + i}`,
      status: paidFully ? "Paid" : partial ? "Partial" : "Unpaid",
      collectorName: i % 2 === 0 ? "Fatima Akter" : "Mahmuda Khatun",
      date: o.createdAt,
    };
  });

export const auditLogs: AuditLog[] = [
  {
    id: "AL-003",
    user: "Kamal Hossain",
    action: "Published batch",
    record: ACTIVE_BATCH_NO,
    oldValue: "Draft",
    newValue: "Active",
    timestamp: atOffset(0, 8, 30),
  },
  {
    id: "AL-002",
    user: "Kamal Hossain",
    action: "Created batch",
    record: ACTIVE_BATCH_NO,
    oldValue: "—",
    newValue: "Draft",
    timestamp: atOffset(0, 7, 55),
  },
  {
    id: "AL-001",
    user: "Nusrat Jahan",
    action: "Closed batch",
    record: "BATCH-2408",
    oldValue: "Active",
    newValue: "Closed",
    timestamp: atOffset(1, 18, 10),
  },
];

export const notifications: AppNotification[] = [
  {
    id: "NT-003",
    kind: "CutoffReminder",
    audience: "All",
    title: "Booking closes soon",
    body: `Today's batch ${ACTIVE_BATCH_NO} stops accepting orders at the cut-off time.`,
    timestamp: atOffset(0, 10, 0),
    read: false,
  },
  {
    id: "NT-002",
    kind: "BatchPublished",
    audience: "All",
    title: "Fresh milk available today",
    body: `Batch ${ACTIVE_BATCH_NO} is live — book your litres before the cut-off.`,
    timestamp: atOffset(0, 8, 30),
    read: false,
  },
  {
    id: "NT-001",
    kind: "PaymentDue",
    audience: "Head Office Coordinator",
    title: "Unpaid collections pending",
    body: "Some delivered orders from earlier batches are still unpaid or partly paid.",
    timestamp: atOffset(1, 17, 45),
    read: true,
  },
];
