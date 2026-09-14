// Server functions (RPC endpoints) for the app screens. This file ships to the
// client as thin fetch stubs, so server-only modules are loaded inside handlers
// (anything under src/server/ is blocked from client bundles). Session and role
// checks happen inside the server module for every call.
import { createServerFn } from "@tanstack/react-start";
import * as schema from "@/lib/app-data.schemas";

const server = () => import("@/server/app-data.server");

export const getAppSnapshot = createServerFn({ method: "GET" }).handler(async () =>
  (await server()).readSnapshot(),
);

export const setBatchStatusFn = createServerFn({ method: "POST" })
  .validator(schema.batchStatusInput)
  .handler(async ({ data }) => (await server()).setBatchStatus(data));

export const createBatchFn = createServerFn({ method: "POST" })
  .validator(schema.createBatchInput)
  .handler(async ({ data }) => (await server()).createBatch(data));

export const confirmOrderFn = createServerFn({ method: "POST" })
  .validator(schema.confirmOrderInput)
  .handler(async ({ data }) => (await server()).confirmOrder(data));

export const approveOrderFn = createServerFn({ method: "POST" })
  .validator(schema.orderActionInput)
  .handler(async ({ data }) => (await server()).approveOrder(data));

export const cancelOrderFn = createServerFn({ method: "POST" })
  .validator(schema.orderReasonInput)
  .handler(async ({ data }) => (await server()).cancelOrder(data));

export const requestCancellationFn = createServerFn({ method: "POST" })
  .validator(schema.orderActionInput)
  .handler(async ({ data }) => (await server()).requestCancellation(data));

export const approveCancellationFn = createServerFn({ method: "POST" })
  .validator(schema.orderActionInput)
  .handler(async ({ data }) => (await server()).approveCancellation(data));

export const rejectCancellationFn = createServerFn({ method: "POST" })
  .validator(schema.orderReasonInput)
  .handler(async ({ data }) => (await server()).rejectCancellation(data));

export const updateOrderFn = createServerFn({ method: "POST" })
  .validator(schema.updateOrderInput)
  .handler(async ({ data }) => (await server()).updateOrder(data));

export const addDeliveryRecordFn = createServerFn({ method: "POST" })
  .validator(schema.deliveryRecordInput)
  .handler(async ({ data }) => (await server()).addDeliveryRecord(data));

export const upsertCollectionFn = createServerFn({ method: "POST" })
  .validator(schema.collectionInput)
  .handler(async ({ data }) => (await server()).upsertCollection(data));

export const markNotificationsReadFn = createServerFn({ method: "POST" }).handler(async () =>
  (await server()).markNotificationsRead(),
);

export const saveEmployeeFn = createServerFn({ method: "POST" })
  .validator(schema.saveEmployeeInput)
  .handler(async ({ data }) => (await server()).saveEmployee(data));

export const deleteEmployeeFn = createServerFn({ method: "POST" })
  .validator(schema.employeeIdInput)
  .handler(async ({ data }) => (await server()).deleteEmployee(data));

export const setEmployeeActiveFn = createServerFn({ method: "POST" })
  .validator(schema.employeeActiveInput)
  .handler(async ({ data }) => (await server()).setEmployeeActive(data));

export const saveDeliveryPointFn = createServerFn({ method: "POST" })
  .validator(schema.saveDeliveryPointInput)
  .handler(async ({ data }) => (await server()).saveDeliveryPoint(data));

export const setDeliveryPointActiveFn = createServerFn({ method: "POST" })
  .validator(schema.deliveryPointActiveInput)
  .handler(async ({ data }) => (await server()).setDeliveryPointActive(data));

export const saveSettingsFn = createServerFn({ method: "POST" })
  .validator(schema.saveSettingsInput)
  .handler(async ({ data }) => (await server()).saveSettings(data));
