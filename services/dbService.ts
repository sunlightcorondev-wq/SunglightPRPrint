import { createClient } from "@libsql/client";
import { DocumentData, OrderItem } from '../types';
import { fetchMockDatabaseRecords } from './geminiService';

// Configuration from environment/prompt
export interface DbConfig {
  url: string;
  authToken: string;
}

export const getDbConfig = (): DbConfig => {
  try {
    const localUrl = typeof window !== 'undefined' ? localStorage.getItem('sunlight_turso_url') : null;
    const localToken = typeof window !== 'undefined' ? localStorage.getItem('sunlight_turso_auth_token') : null;
    if (localUrl) {
      return {
        url: localUrl,
        authToken: localToken || ''
      };
    }
  } catch (e) {
    console.error("Failed to read DB config from localStorage", e);
  }

  const envUrl = (import.meta as any).env?.VITE_TURSO_URL || '';
  const envToken = (import.meta as any).env?.VITE_TURSO_AUTH_TOKEN || '';

  return {
    url: envUrl,
    authToken: envToken
  };
};

export const saveDbConfig = (url: string, authToken: string): void => {
  try {
    if (url) {
      localStorage.setItem('sunlight_turso_url', url.trim());
      localStorage.setItem('sunlight_turso_auth_token', authToken.trim());
    } else {
      localStorage.removeItem('sunlight_turso_url');
      localStorage.removeItem('sunlight_turso_auth_token');
    }
    clientInstance = null;
  } catch (e) {
    console.error("Failed to save DB config to localStorage", e);
  }
};

// Lazy initialization pattern
let clientInstance: any = null;

const getClient = () => {
  const config = getDbConfig();
  if (!config.url) {
    throw new Error("Turso Database URL is not configured. Please set the VITE_TURSO_URL environment variable or configure it in the Database Settings modal.");
  }
  if (!clientInstance) {
    clientInstance = createClient({
      url: config.url,
      authToken: config.authToken
    });
  }
  return clientInstance;
};

export const updateRequisitionStatus = async (id: string, status: string): Promise<void> => {
  try {
    const client = getClient();
    await client.execute({
      sql: "UPDATE requisitions SET status = ? WHERE id = ?",
      args: [status, id]
    });
  } catch (error) {
    console.error("Failed to update status in DB:", error);
  }
};

export const fetchDatabaseRecords = async (): Promise<DocumentData[]> => {
  try {
    console.log("Attempting to connect to Turso DB...");
    const client = getClient();
    
    // 1. Fetch the main requisitions
    // We select all columns, which includes the 'items' JSON column
    const requisitionsResult = await client.execute(`
      SELECT * FROM requisitions 
      ORDER BY date ASC 
      LIMIT 50
    `);

    // Fetch department heads config
    let departmentHeads: Record<string, string> = {};
    try {
      const configResult = await client.execute(`
        SELECT value_json FROM config WHERE key = 'department_heads'
      `);
      if (configResult.rows.length > 0) {
        const valueJson = configResult.rows[0].value_json;
        if (typeof valueJson === 'string') {
          departmentHeads = JSON.parse(valueJson);
        }
      }
    } catch (configError) {
      console.warn("Failed to fetch department_heads config:", configError);
    }

    if (requisitionsResult.rows.length === 0) {
      return [];
    }

    const documents: DocumentData[] = [];

    // 2. Iterate and map each row
    for (const row of requisitionsResult.rows) {
      const id = String(row.id);
      
      let items: OrderItem[] = [];

      // Logic to parse the 'items' column which is stored as a JSON string
      const itemsRaw = row.items;
      if (itemsRaw && typeof itemsRaw === 'string') {
        try {
          const parsedItems = JSON.parse(itemsRaw);
          if (Array.isArray(parsedItems)) {
             items = parsedItems.map((item: any) => {
                const qty = Number(item.quantity || 0);
                const cost = Number(item.estimatedCost || item.unitPrice || 0);
                
                return {
                  // Map 'name' -> Particulars (description)
                  description: String(item.name || item.description || ""),
                  // Map 'quantity' -> Qty Request
                  quantity: qty,
                  // Map 'unit' -> UOM
                  uom: (() => {
                    const desc = String(item.name || item.description || "").toLowerCase();
                    const uom = String(item.unit || item.uom || "").toUpperCase();
                    if (desc.includes("emborg fresh milk") && uom === "CASE") {
                      return "PCS";
                    }
                    return uom;
                  })(),
                  // Map 'estimatedCost' -> Unit Cost
                  unitPrice: cost,
                  // Calculate Total
                  total: qty * cost,
                  // Map 'source' -> Remarks (optional but useful)
                  remarks: String(item.source || item.remarks || "")
                };
             });
          }
        } catch (e) {
          console.warn(`Failed to parse 'items' JSON for requisition ${id}`, e);
        }
      }

      const getStr = (val: any) => val ? String(val) : "";

      documents.push({
        id: id,
        type: 'Requisition Form',
        department: getStr(row.department),
        purpose: getStr(row.description || row.purpose),
        date: getStr(row.date),
        deliverOn: getStr(row.deliver_on || row.deliverOn),
        status: (['Approved', 'Pending', 'Processing', 'For signing', 'Completed'].includes(row.status as string) 
          ? row.status as any 
          : 'Pending'),
        items: items,
        totalAmount: Number(row.total_amount || row.totalAmount || items.reduce((acc, curr) => acc + curr.total, 0)),
        // Map 'requester' from DB to 'preparedBy'
        preparedBy: getStr(row.requester || row.prepared_by || row.preparedBy),
        notedBy: departmentHeads[getStr(row.department)] || "",
        approvedBy: getStr(row.approved_by || row.approvedBy),
        receivedBy: getStr(row.received_by || row.receivedBy),
        checkedBy: getStr(row.checked_by || row.checkedBy),
        pr_for: getStr(row.pr_for)
      });
    }

    return documents;

  } catch (error) {
    console.warn("Primary Database Connection Failed. Error:", error);
    console.log("Switching to Gemini Mock Data Service...");
    
    // Fallback to Gemini Service
    try {
      return await fetchMockDatabaseRecords();
    } catch (fallbackError) {
      console.error("Fallback Service also failed:", fallbackError);
      throw error;
    }
  }
};