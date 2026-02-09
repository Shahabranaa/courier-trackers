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
  apiToken: string; // PostEx Token
  tranzoToken?: string; // Tranzo Token
  proxyUrl?: string; // Optional proxy for geo-restricted APIs (e.g., http://ip:port)
  shopifyStore?: string; // Shopify store domain (e.g., mystore.myshopify.com)
  shopifyAccessToken?: string; // Shopify Admin API access token
}

export interface PaymentStatus {
  trackingNumber: string;
  paymentStatus: string;
  [key: string]: any;
}
