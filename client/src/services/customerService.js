import axios from "axios";

const API = axios.create({
    baseURL: "/api",
});

function authHeaders() {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const getCustomers = (params) => API.get("/customers", { params, headers: authHeaders() });
export const createCustomer = (payload) => API.post("/customers", payload, { headers: authHeaders() });
export const updateCustomer = (id, payload) => API.put(`/customers/${id}`, payload, { headers: authHeaders() });
export const deleteCustomer = (id) => API.delete(`/customers/${id}`, { headers: authHeaders() });

export default {
    getCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
};
