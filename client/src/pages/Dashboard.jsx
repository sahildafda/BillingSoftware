import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
    Badge, Box, Button, Heading, HStack, Icon, Select, SimpleGrid, Spinner, Stack, Text, VStack,
} from "@chakra-ui/react";
import {
    LuBell, LuCircleDollarSign, LuPackage, LuPlus, LuReceipt, LuSearch, LuUsers,
} from "react-icons/lu";
import AppLayout from "../components/layout/AppLayout";
import { ROUTES } from "../constants/routes";

function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [dashboard, setDashboard] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [period, setPeriod] = useState("month");

    async function loadDashboard() {
        try {
            setLoading(true);
            setError("");
            const token = localStorage.getItem("authToken");
            const response = await axios.get("/api/dashboard", { params: { period }, headers: token ? { Authorization: `Bearer ${token}` } : {} });
            setDashboard(response.data);
        } catch (err) {
            setError(err?.response?.data?.message || "Unable to load dashboard data.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadDashboard(); }, [period]);

    const summary = dashboard?.summary || {};
    const stats = [
        { label: "Revenue", value: formatMoney(summary.revenue), hint: `${formatMoney(summary.todayRevenue)} today`, icon: LuCircleDollarSign },
        { label: "Orders", value: Number(summary.orders || 0).toLocaleString("en-IN"), hint: `${summary.todayOrders || 0} today`, icon: LuReceipt },
        { label: "Customers", value: Number(summary.customers || 0).toLocaleString("en-IN"), hint: `${summary.newCustomers || 0} new ${dashboard?.periodLabel?.toLowerCase() || "this month"}`, icon: LuUsers },
        { label: "Stock", value: Number(summary.stockUnits || 0).toLocaleString("en-IN"), hint: `${summary.products || 0} products`, icon: LuPackage },
    ];
    const quickActions = [
        { label: "Create invoice", route: ROUTES.BILLING },
        { label: "Add product", route: ROUTES.PRODUCTS },
        { label: "New customer", route: ROUTES.CUSTOMERS },
        { label: "View reports", route: ROUTES.REPORTS },
    ];

    return (
        <AppLayout>
            <Box bgGradient="linear(135deg, primary 0%, #f59e0b 100%)" rounded="2xl" p={{ base: 6, md: 8 }} boxShadow="xl">
                <HStack justify="space-between" align="start" wrap="wrap" gap={4}>
                    <Box maxW="680px">
                        <Badge bg="rgba(255,255,255,0.2)" color="white" rounded="full" px={3} py={1}>Sales dashboard</Badge>
                        <Heading mt={3} size="lg" color="white">Your business at a glance</Heading>
                        <Text mt={3} color="whiteAlpha.900" fontSize="md">Live sales, customer, and inventory information from your billing system.</Text>
                    </Box>
                    <Stack direction={{ base: "column", sm: "row" }} spacing={3}>
                        <Select value={period} onChange={(e) => setPeriod(e.target.value)} bg="white" color="gray.800" borderColor="white" width="145px">
                            <option value="month">This month</option>
                            <option value="year">This year</option>
                            <option value="total">All time</option>
                        </Select>
                        <Button leftIcon={<LuPlus />} bg="white" color="primary" _hover={{ bg: "gray.100" }} onClick={() => navigate(ROUTES.BILLING)}>New invoice</Button>
                        <Button leftIcon={<LuBell />} variant="outline" borderColor="whiteAlpha.500" color="white" _hover={{ bg: "whiteAlpha.200" }} onClick={loadDashboard}>Refresh</Button>
                    </Stack>
                </HStack>
            </Box>

            {loading ? <Box py={16} textAlign="center"><Spinner color="orange.400" size="xl" /></Box> : error ? (
                <Box bg="rgba(239,68,68,0.12)" border="1px solid" borderColor="red.400" rounded="xl" p={4}><Text color="red.200">{error}</Text></Box>
            ) : <>
                <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
                    {stats.map((item) => <Box key={item.label} bg="surface" border="1px solid" borderColor="border" rounded="2xl" p={5}>
                        <HStack justify="space-between"><Box><Text color="muted" fontSize="sm">{item.label}</Text><Heading size="md" mt={1}>{item.value}</Heading><Text color="primary" fontSize="sm" mt={1}>{item.hint}</Text></Box><Box bg="card" p={3} rounded="xl"><Icon as={item.icon} boxSize={5} color="primary" /></Box></HStack>
                    </Box>)}
                </SimpleGrid>

                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
                    <Box bg="surface" border="1px solid" borderColor="border" rounded="2xl" p={6}>
                        <HStack justify="space-between" mb={4}><Heading size="md">Quick actions</Heading><Button size="sm" variant="ghost" color="primary" leftIcon={<LuSearch />} onClick={() => navigate(ROUTES.REPORTS)}>Explore</Button></HStack>
                        <VStack align="stretch" spacing={3}>{quickActions.map((action) => <Box key={action.label} bg="card" rounded="xl" p={3} border="1px solid" borderColor="border" cursor="pointer" _hover={{ borderColor: "orange.400" }} onClick={() => navigate(action.route)}><Text fontWeight="600">{action.label}</Text><Text fontSize="sm" color="muted">Jump right into your daily workflow.</Text></Box>)}</VStack>
                    </Box>
                    <Box bg="surface" border="1px solid" borderColor="border" rounded="2xl" p={6}>
                        <Heading size="md" mb={4}>{dashboard.periodLabel} at a glance</Heading>
                        <VStack align="stretch" spacing={3}>
                            <HStack justify="space-between"><Text color="muted">Pending invoices</Text><Text fontWeight="700">{summary.pendingInvoices}</Text></HStack>
                            <HStack justify="space-between"><Text color="muted">Low stock alerts</Text><Text fontWeight="700">{summary.lowStock} items</Text></HStack>
                            <HStack justify="space-between"><Text color="muted">Customer credit</Text><Text fontWeight="700" color="green.300">{formatMoney(summary.customerCredit)}</Text></HStack>
                        </VStack>
                        <Heading size="sm" mt={7} mb={3}>Recent invoices</Heading>
                        <VStack align="stretch" spacing={2}>{dashboard.recentInvoices?.length ? dashboard.recentInvoices.map((invoice) => <HStack key={invoice.id} justify="space-between" bg="card" borderRadius="md" p={3}><Box><Text fontWeight={600}>{invoice.invoiceNumber}</Text><Text fontSize="sm" color="muted">{invoice.customerName || "Walk-in Customer"}</Text></Box><Text fontWeight={700}>{formatMoney(invoice.total)}</Text></HStack>) : <Text color="muted">No invoices yet.</Text>}</VStack>
                    </Box>
                </SimpleGrid>
            </>}
        </AppLayout>
    );
}
