export interface AnnualDividend {
  beforeTaxAmount: number | null;
  estimatedTaxAmount: number | null;
  afterTaxAmount: number | null;
  currency: string;
}

export interface CurrentMonthDividend {
  month: number;
  afterTaxAmount: number | null;
}

export interface NextDividend {
  ticker: string;
  stockName: string;
  displayDateText: string;
  beforeTaxAmount: number | null;
  afterTaxAmount: number | null;
  status: string;
}

export interface AnnualGoal {
  targetAmount: number;
  currentAmount: number;
  achievementRate: number | null;
}

export interface RecentDividendChange {
  changeType: string;
  ticker: string;
  stockName: string;
  dividendPerShare: number | null;
  previousDividendPerShare: number | null;
}

export interface HomeSummary {
  year: number;
  holdingCount: number;
  annualDividend: AnnualDividend;
  currentMonthDividend: CurrentMonthDividend;
  nextDividend: NextDividend | null;
  annualGoal: AnnualGoal | null;
  recentDividendChange: RecentDividendChange | null;
}

export interface CalendarMonth {
  month: number;
  amount: number | null;
  eventCount: number;
}

export interface MonthDetailEvent {
  holdingId: string;
  stockId: string;
  ticker: string;
  stockName: string;
  accountType: string;
  quantity: number;
  eventType: string;
  displayDateText: string;
  beforeTaxAmount: number | null;
  estimatedTaxAmount: number | null;
  afterTaxAmount: number | null;
  status: string;
  sourceType: string | null;
  sourceUrl: string | null;
}

export interface MonthDetail {
  year: number;
  month: number;
  basis: string;
  totalBeforeTaxAmount: number | null;
  totalEstimatedTaxAmount: number | null;
  totalAfterTaxAmount: number | null;
  events: MonthDetailEvent[];
}

export interface StockDetailInfo {
  id: string;
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number | null;
  expectedAnnualDividendPerShare: number | null;
  expectedDividendYield: number | null;
}

export interface StockDetailHolding {
  accountType: string;
  quantity: number;
  annualBeforeTaxAmount: number | null;
  annualAfterTaxAmount: number | null;
}

export interface StockDetailScheduleEvent {
  eventType: string;
  expectedPaymentDate: string | null;
  expectedPaymentMonth: number | null;
  dividendPerShare: number | null;
  status: string;
}

export interface StockDetailSource {
  sourceType: string | null;
  sourceUrl: string | null;
  sourcePublishedAt: string | null;
  reviewStatus: string;
}

export interface StockDetail {
  stock: StockDetailInfo;
  userHoldings: StockDetailHolding[];
  dividendSchedule: StockDetailScheduleEvent[];
  source: StockDetailSource | null;
}
