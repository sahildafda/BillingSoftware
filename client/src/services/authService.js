import axios from "axios";

const API = axios.create({
    baseURL: "/api",
});

export const registerUser = (payload) => API.post("/auth/register", payload);
export const verifyOtp = (payload) => API.post("/auth/verify-otp", payload);
export const loginUser = (payload) => API.post("/auth/login", payload);
export const forgotPassword = (payload) => API.post("/auth/forgot-password", payload);
export const changePassword = (payload, token) =>
    API.post("/auth/change-password", payload, {
        headers: { Authorization: `Bearer ${token}` },
    });

export const logoutUser = (token) =>
    API.post(
        "/auth/logout",
        {},
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

export const importDatabase = (file, token) => {
    const formData = new FormData();
    formData.append("databaseFile", file);

    return API.post("/db/import", formData, {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
        },
    });
};

export const exportDatabase = async (token) => {
    const response = await API.post(
        "/db/backup",
        {},
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );

    return response.data;
};
