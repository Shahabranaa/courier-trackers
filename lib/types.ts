export interface Order {
  orderRefNumber: string;
  invoicePayment: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  transactionDate: string;
  trackingNumber: string;
  orderDetail: string;
  orderType: string;
  orderDate: string;
  orderAmount: number;
  orderStatus: string; // e.g., "Booked", "Arrived at Origin", etc.
}

export interface TrackingStatus {
  trackingNumber: string;
  currentStatus: string;
  activityHistory: {
    status: string;
    date: string;
    details: string;
  }[];
}

export interface Brand {
  id: string;
  name: string;
  apiToken: string;
}
