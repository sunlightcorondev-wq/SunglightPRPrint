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
let inventoryClientInstance: any = null;
let purchasingClientInstance: any = null;

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

const getInventoryClient = (department: string) => {
  const isPurchasing = department.trim().toLowerCase() === 'purchasing';
  
  if (isPurchasing) {
    if (!purchasingClientInstance) {
      purchasingClientInstance = createClient({
        url: "libsql://coronwarehousedb-sunlightcorondev.aws-ap-northeast-1.turso.io",
        authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODM2NDQ0MDUsImlkIjoiMDE5ZjAyMTAtMGQwMS03N2RjLTkwYmItYjllYjU5MDlkMzZhIiwia2lkIjoicDN5bE95S3I2cUxRZ0dIYkpzTnJsZ0JSaWdYSjd3ZS05dmhQZVc2OFFQVSIsInJpZCI6IjYxYjgwMGNiLTJmZmItNGQwNC1hOTQzLTgwZTg5NzNmMWMxNiJ9.cZ20ri2CVO8WzlqrLtA2B3IxDHCLaxFtY8FNWNHhrx_IMdJkPeFQeZWJBm7yApd9kY5mOmceG1YW9ey-EWjtCQ"
      });
    }
    return purchasingClientInstance;
  } else {
    if (!inventoryClientInstance) {
      inventoryClientInstance = createClient({
        url: "libsql://departmentinventory-sunlightcorondev.aws-ap-northeast-1.turso.io",
        authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODM2NDI2MzIsImlkIjoiMDE5ZjEyN2ItMGYwMS03NTVmLThlN2EtYTRkNWU3MDNkNzdlIiwia2lkIjoicDN5bE95S3I2cUxRZ0dIYkpzTnJsZ0JSaWdYSjd3ZS05dmhQZVc2OFFQVSIsInJpZCI6IjI5NmUzNzFjLTkzZWItNDc1Zi04OWZkLTVmMzc2ODgwYTc4YiJ9.6PBm-s1tEHcXR3Y6PnxWcjgs3_Kw6Ge1StBEDoOii-RvCdW9VoZwrUbNKQ4lONWZKS4Fu9K1MKxUSHn4dQiqCQ"
      });
    }
    return inventoryClientInstance;
  }
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
                const description = String(item.name || item.description || "");
                const source = String(item.source || "");
                const itemRemarks = String(item.remarks || "");
                const combinedRemarks = [source, itemRemarks].filter(Boolean).join(" ");
                const availableStock = item.availableStock !== undefined ? item.availableStock : (item.available_stock !== undefined ? item.available_stock : '');
                
                return {
                  // Map 'name' -> Particulars (description)
                  description,
                  // Map 'quantity' -> Qty Request
                  quantity: qty,
                  // Map 'unit' -> UOM
                  uom: (() => {
                    const desc = description.toLowerCase();
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
                  // Map source and remarks
                  remarks: combinedRemarks,
                  soh: availableStock !== '' ? availableStock : ''
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

export const fetchSOH = async (department: string, itemName: string): Promise<number> => {
  const isPurchasing = department.trim().toLowerCase() === 'purchasing';
  try {
    const client = getInventoryClient(department);
    
    let result;
    if (isPurchasing) {
      result = await client.execute({
        sql: `SELECT sum(b.quantity) as total_quantity 
              FROM batches b 
              JOIN items i ON b.item_id = i.id 
              WHERE LOWER(trim(i.name)) = ?`,
        args: [itemName.trim().toLowerCase()]
      });
      if (result.rows.length > 0 && result.rows[0].total_quantity !== null) {
        return Number(result.rows[0].total_quantity || 0);
      }
    } else {
      result = await client.execute({
        sql: `SELECT quantity FROM inventory WHERE LOWER(trim(department)) = ? AND LOWER(trim(name)) = ?`,
        args: [department.trim().toLowerCase(), itemName.trim().toLowerCase()]
      });
      if (result.rows.length > 0 && result.rows[0].quantity !== null) {
        return Number(result.rows[0].quantity || 0);
      }
    }
    return 0;
  } catch (err) {
    console.error("Failed to fetch SOH:", err);
    return 0;
  }
};
