export interface Order {
  orderRefNumber: string;
  invoicePayment: number;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  transactionDate: string;
  trackingNumber: string;
  tracking?: string; // Potential alias based on user input
  orderDetail: string;
  orderType: string;
  orderDate: string;
  orderAmount: number;
  orderStatus: string; // e.g., "Booked", "Arrived at Origin", etc.
  transactionStatus: string;
  cityName: string;
  transactionTax?: number;
  transactionFee?: number;
  upfrontPayment?: number;
  actualWeight?: number;
  lastStatus?: string;
  lastStatusTime?: string | Date;
  reversalTax?: number;
  reversalFee?: number;
  salesWithholdingTax?: number;
  netAmount?: number;
}

export interface TrackingStatus {
  trackingNumber: string;
  currentStatus: string;
  activityHistory: {
    status: string;
    date: string;
    details: string;
  }[];
  transactionStatusHistory?: {
    transactionDate: string;
    transactionStatus: string;
    comments?: string;
    [key: string]: any;
  }[];
  [key: string]: any;
}

export interface Brand {
  id: string;
  name: string;
  apiToken: string;
  tranzoToken?: string;
  proxyUrl?: string;
  shopifyStore?: string;
  shopifyAccessToken?: string;
  shopifyClientId?: string;
  shopifyClientSecret?: string;
}

export interface PaymentStatus {
  trackingNumber: string;
  paymentStatus: string;
  [key: string]: any;
}
