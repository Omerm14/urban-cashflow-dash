export const STATUS   = { UNPAID: "Unpaid", PAID: "Paid", OVERDUE: "Overdue", CREDIT: "Credit", RECEIVED: "Received", EXPECTED: "Expected" };
export const PALETTE  = ["#38bdf8","#34d399","#fb923c","#60a5fa","#f472b6","#facc15","#4ade80","#e879f9","#38bdf8","#f87171"];
export const MOCK_NAMES = ["Acme Supplies","Beta Logistics","Gamma Tech","Delta Print","Epsilon Media"];

export const DIRECTION = { EXPENSE: "expense", INCOME: "income" };

export const EXPENSE_CATEGORIES = [
  { value: "food_bev",       label: "Food & Beverages" },
  { value: "staff",          label: "Staff" },
  { value: "rent",           label: "Rent" },
  { value: "utilities",      label: "Utilities" },
  { value: "marketing",      label: "Marketing" },
  { value: "packaging",      label: "Packaging" },
  { value: "other_expense",  label: "Other" },
];

export const INCOME_CATEGORIES = [
  { value: "pos_sales",     label: "POS Sales" },
  { value: "wolt",          label: "Wolt Delivery" },
  { value: "catering",      label: "Catering" },
  { value: "other_income",  label: "Other Income" },
];
