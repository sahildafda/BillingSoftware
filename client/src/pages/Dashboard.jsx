import { useEffect, useState } from "react";
import axios from "axios";
import { Box, Button, Flex, Heading, HStack, Icon, Select, SimpleGrid, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import { LuCircleDollarSign, LuPackage, LuReceipt, LuRefreshCw, LuUsers } from "react-icons/lu";
import AppLayout from "../components/layout/AppLayout";

const COLORS = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#eab308"];
const money = (value, compact = false) => Number(value || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: compact ? 1 : 2, notation: compact ? "compact" : "standard" });
const Empty = () => <Flex minH="220px" align="center" justify="center"><Text color="muted">No data available for this period.</Text></Flex>;

function OrdersChart({ data }) {
    const [hovered, setHovered] = useState(null);
    if (!data?.length) return <Empty />;
    const width = 760, height = 250, pad = 42, max = Math.max(...data.map((item) => item.orders), 1);
    const points = data.map((item, index) => ({ ...item, x: pad + index * (width - pad * 2) / Math.max(data.length - 1, 1), y: height - pad - item.orders / max * (height - pad * 2) }));
    const line = points.map((point) => `${point.x},${point.y}`).join(" ");
    const totalOrders = data.reduce((sum, item) => sum + item.orders, 0);
    return <Box position="relative" onMouseLeave={() => setHovered(null)}>
        <style>{`@keyframes sweepOrderGlow { 0% { stroke-dashoffset: 1; opacity: 0; } 10% { opacity: 1; } 65% { stroke-dashoffset: 0; opacity: 1; } 82%, 100% { stroke-dashoffset: 0; opacity: 0; } } @keyframes showOrderPoint { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }`}</style>
        <HStack position="absolute" top={0} right={2} zIndex={1} spacing={5}><Box textAlign="right"><Text fontSize="xs" color="muted">Total orders</Text><Text fontWeight="800">{totalOrders}</Text></Box><Box textAlign="right"><Text fontSize="xs" color="muted">Best period</Text><Text fontWeight="800">{max}</Text></Box></HStack>
        <Box overflowX="auto" overflowY="hidden"><Box as="svg" viewBox={`0 0 ${width} ${height}`} minW="560px" width="100%" height="250px" aria-label="Orders line chart">
            <defs><filter id="orderGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter><linearGradient id="orderArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f97316" stopOpacity=".28" /><stop offset="1" stopColor="#f97316" stopOpacity="0" /></linearGradient></defs>
            {[0, 1, 2, 3].map((step) => { const y = pad + step * (height - pad * 2) / 3; const value = Math.round(max * (1 - step / 3)); return <g key={step}><line x1={pad} x2={width - pad} y1={y} y2={y} stroke="#64748b" strokeOpacity="0.16" /><text x={pad - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{value}</text></g>; })}
            <polyline points={`${pad},${height - pad} ${line} ${width - pad},${height - pad}`} fill="url(#orderArea)" stroke="none" />
            <polyline points={line} fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={line} pathLength="1" fill="none" stroke="#fdba74" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" filter="url(#orderGlow)" strokeDasharray="1" style={{ animation: "sweepOrderGlow 3s ease-in-out infinite" }} />
            {points.map((point, index) => <g key={`${point.label}-${index}`} onMouseEnter={() => setHovered(point)} style={{ cursor: "pointer", transformOrigin: `${point.x}px ${point.y}px`, animation: `showOrderPoint .3s ease-out ${1 + index * .07}s both` }}><circle cx={point.x} cy={point.y} r="16" fill="transparent" /><circle cx={point.x} cy={point.y} r={hovered === point ? 8 : 5} fill="#f97316" stroke="white" strokeWidth="2" pointerEvents="none" />{(data.length <= 12 || index % Math.ceil(data.length / 10) === 0) && <text x={point.x} y={height - 12} textAnchor="middle" fontSize="11" fill="#94a3b8" pointerEvents="none">{point.label}</text>}</g>)}
        </Box></Box>{hovered && <Box position="absolute" left={`clamp(88px, ${hovered.x / width * 100}%, calc(100% - 88px))`} top={`${Math.max(hovered.y - 12, 0) / height * 100}%`} transform="translate(-50%, -100%)" bg="gray.900" color="white" px={3} py={2} rounded="md" boxShadow="0 0 18px rgba(249,115,22,.35)" pointerEvents="none" zIndex={2} whiteSpace="nowrap"><Text fontSize="xs" color="gray.300">Period {hovered.label}</Text><Text fontSize="md" fontWeight="800">{hovered.orders} {hovered.orders === 1 ? "order" : "orders"}</Text><Text fontSize="xs" color="orange.200">Revenue {money(hovered.revenue)}</Text></Box>}</Box>;
}

function PaymentChart({ data }) {
    if (!data?.length) return <Empty />;
    const total = data.reduce((sum, item) => sum + item.amount, 0) || 1;
    const gradient = data.reduce((result, item, index) => {
        const start = result.cursor;
        const end = start + item.amount / total * 100;
        return { cursor: end, stops: [...result.stops, `${COLORS[index % COLORS.length]} ${start}% ${end}%`] };
    }, { cursor: 0, stops: [] }).stops.join(", ");
    return <Flex minH="220px" align="center" justify="center" gap={{ base: 6, md: 10 }} wrap="wrap">
        <Flex width="160px" height="160px" borderRadius="full" bg={`conic-gradient(${gradient})`} align="center" justify="center"><Flex width="104px" height="104px" borderRadius="full" bg="surface" align="center" justify="center" direction="column"><Text fontSize="xs" color="muted">Collected</Text><Text fontWeight="800">{money(total, true)}</Text></Flex></Flex>
        <VStack align="stretch" spacing={3} minW="180px">{data.map((item, index) => <HStack key={item.method} justify="space-between"><HStack><Box width="10px" height="10px" rounded="full" bg={COLORS[index % COLORS.length]} /><Text textTransform="capitalize">{item.method}</Text></HStack><Text fontWeight="700">{Math.round(item.amount / total * 100)}%</Text></HStack>)}</VStack>
    </Flex>;
}

function ProductsChart({ data }) {
    if (!data?.length) return <Empty />;
    const max = Math.max(...data.map((item) => item.units), 1);
    return <VStack align="stretch" spacing={4} minH="220px" justify="center">{data.map((item) => <Box key={item.productName}><HStack justify="space-between" mb={1}><Text fontSize="sm" fontWeight="600" noOfLines={1}>{item.productName}</Text><Text fontSize="sm" color="muted">{item.units} units · {money(item.revenue, true)}</Text></HStack><Box height="9px" bg="card" rounded="full" overflow="hidden"><Box height="100%" width={`${Math.max(item.units / max * 100, 3)}%`} bgGradient="linear(to-r, orange.400, orange.500)" rounded="full" /></Box></Box>)}</VStack>;
}

function ChartCard({ title, description, children }) {
    return <Box bg="surface" border="1px solid" borderColor="border" rounded="2xl" p={{ base: 4, md: 6 }}><Heading size="md">{title}</Heading><Text color="muted" fontSize="sm" mt={1} mb={4}>{description}</Text>{children}</Box>;
}

export default function Dashboard() {
    const [dashboard, setDashboard] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
    const [period, setPeriod] = useState("month"), [dataView, setDataView] = useState("all");
    async function loadDashboard() {
        try {
            setLoading(true); setError("");
            const token = localStorage.getItem("authToken");
            const response = await axios.get("/api/dashboard", { params: { period }, headers: token ? { Authorization: `Bearer ${token}` } : {} });
            setDashboard(response.data);
        } catch (err) { setError(err?.response?.data?.message || "Unable to load dashboard data."); } finally { setLoading(false); }
    }
    // The selected period is the external query input for this dashboard request.
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    useEffect(() => { loadDashboard(); }, [period]);
    const summary = dashboard?.summary || {}, charts = dashboard?.charts || {};
    const stats = [
        { label: "Revenue", value: money(summary.revenue), hint: `${money(summary.todayRevenue)} today`, icon: LuCircleDollarSign },
        { label: "Orders", value: Number(summary.orders || 0).toLocaleString("en-IN"), hint: `${summary.todayOrders || 0} today`, icon: LuReceipt },
        { label: "Customers", value: Number(summary.customers || 0).toLocaleString("en-IN"), hint: `${summary.newCustomers || 0} new in period`, icon: LuUsers },
        { label: "Inventory", value: Number(summary.stockUnits || 0).toLocaleString("en-IN"), hint: `${summary.lowStock || 0} low · ${summary.outOfStock || 0} out`, icon: LuPackage },
    ];
    return <AppLayout>
        <Flex justify="space-between" align={{ base: "stretch", md: "center" }} direction={{ base: "column", md: "row" }} gap={4}>
            <Box><Heading size="lg">Business analytics</Heading><Text color="muted" mt={1}>Performance, payments, and inventory in one place.</Text></Box>
            <Stack direction={{ base: "column", sm: "row" }} spacing={3}>
                <Select value={dataView} onChange={(e) => setDataView(e.target.value)} bg="surface" borderColor="border" width={{ base: "100%", sm: "180px" }} aria-label="Choose dashboard data"><option value="all">All data</option><option value="sales">Sales</option><option value="payments">Payments</option><option value="inventory">Inventory</option></Select>
                <Select value={period} onChange={(e) => setPeriod(e.target.value)} bg="surface" borderColor="border" width={{ base: "100%", sm: "150px" }}><option value="month">This month</option><option value="year">This year</option><option value="total">All time</option></Select>
                <Button leftIcon={<LuRefreshCw />} colorScheme="orange" variant="outline" onClick={loadDashboard}>Refresh</Button>
            </Stack>
        </Flex>
        {loading ? <Box py={16} textAlign="center"><Spinner color="orange.400" size="xl" /></Box> : error ? <Box bg="rgba(239,68,68,0.12)" border="1px solid" borderColor="red.400" rounded="xl" p={4}><Text color="danger">{error}</Text></Box> : <>
            <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>{stats.map((item) => <Box key={item.label} bg="surface" border="1px solid" borderColor="border" rounded="2xl" p={5}><HStack justify="space-between"><Box><Text color="muted" fontSize="sm">{item.label}</Text><Heading size="md" mt={1}>{item.value}</Heading><Text color="primary" fontSize="sm" mt={1}>{item.hint}</Text></Box><Box bg="card" p={3} rounded="xl"><Icon as={item.icon} boxSize={5} color="primary" /></Box></HStack></Box>)}</SimpleGrid>
            {(dataView === "all" || dataView === "sales") && <ChartCard title="Orders over time" description={`${dashboard.periodLabel} order activity. Hover over any point to see its orders and revenue.`}><OrdersChart data={charts.salesTrend} /></ChartCard>}
            <SimpleGrid columns={{ base: 1, xl: dataView === "all" ? 2 : 1 }} spacing={4}>
                {(dataView === "all" || dataView === "payments") && <ChartCard title="Payment mix" description="How customers paid during the selected period."><PaymentChart data={charts.paymentBreakdown} /></ChartCard>}
                {(dataView === "all" || dataView === "inventory") && <ChartCard title="Top-selling products" description="Products ranked by units sold in the selected period."><ProductsChart data={charts.topProducts} /></ChartCard>}
            </SimpleGrid>
            {dataView === "inventory" && <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>{[{ label: "Products", value: summary.products }, { label: "Low stock", value: summary.lowStock }, { label: "Out of stock", value: summary.outOfStock }].map((item) => <Box key={item.label} bg="surface" border="1px solid" borderColor="border" rounded="xl" p={5}><Text color="muted">{item.label}</Text><Heading mt={1}>{item.value || 0}</Heading></Box>)}</SimpleGrid>}
        </>}
    </AppLayout>;
}
