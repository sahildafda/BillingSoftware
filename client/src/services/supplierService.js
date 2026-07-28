import axios from "axios";

const API = axios.create({
    baseURL: "/api",
});

function authHeaders() {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const getSuppliers = (params) => API.get("/suppliers", { params, headers: authHeaders() });
export const createSupplier = (payload) => API.post("/suppliers", payload, { headers: authHeaders() });
export const updateSupplier = (id, payload) => API.put(`/suppliers/${id}`, payload, { headers: authHeaders() });
export const deleteSupplier = (id) => API.delete(`/suppliers/${id}`, { headers: authHeaders() });

export default {
    getSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
};