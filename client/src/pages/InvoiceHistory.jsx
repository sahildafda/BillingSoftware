import { useEffect, useMemo, useState } from "react";
import {
    Badge,
    Box,
    Button,
    Divider,
    Flex,
    HStack,
    Input,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    Select,
    Spinner,
    Table,
    Tbody,
    Td,
    Text,
    Th,
    Thead,
    Tr,
    VStack,
} from "@chakra-ui/react";
import { LuPrinter, LuArrowUpRight, LuFileDown, LuFileSpreadsheet, LuUndo2 } from "react-icons/lu";

import AppLayout from "../components/layout/AppLayout";
import * as invoiceService from "../services/invoiceService";
import { downloadExcelFile, getReportRecords, getReportSummary, normalizeGstFilter, printProfessionalReport } from "../utils/reportExport";

const PAYMENT_METHOD_LABELS = {
    cash: "Cash",
    online: "Online",
    card: "Card",
};

function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function InvoiceReceiptModal({ invoice, isOpen, onClose }) {
    if (!invoice) return null;

    const paymentSummary = (invoice.payments || []).reduce((acc, payment) => {
        acc[payment.method] = (acc[payment.method] || 0) + Number(payment.amount || 0);
        return acc;
    }, {});

    const printReceipt = () => {
        window.print();
    };

    return (
        <>
            <style>{`
                @media print {
                    body * {
                        visibility: hidden !important;
                    }

                    .receipt-print,
                    .receipt-print * {
                        visibility: visible !important;
                    }

                    .receipt-print {
                        position: absolute !important;
                        inset: 0 auto auto 0 !important;
                        width: 100% !important;
                        padding: 0 !important;
                    }

                    .receipt-print-controls {
                        display: none !important;
                    }
                }
            `}</style>
            <Modal isOpen={isOpen} onClose={onClose} size="xl">
                <ModalOverlay />
                <ModalContent bg="white" color="black" p={2}>
                <ModalHeader className="receipt-print-controls">
                    <HStack justify="space-between">
                        <Text>Invoice Receipt</Text>
                        <Button size="sm" leftIcon={<LuPrinter />} onClick={printReceipt}>Print</Button>
                    </HStack>
                </ModalHeader>
                <ModalCloseButton className="receipt-print-controls" color="black" />
                <ModalBody>
                    <Box className="receipt-print" p={4}>
                        <VStack align="stretch" spacing={4}>
                            <Flex justify="space-between">
                                <Box>
                                    <Text fontSize="2xl" fontWeight={700}>Billing Hub</Text>
                                    <Text fontSize="sm">{invoice.invoiceNumber}</Text>
                                </Box>
                                <Text fontSize="sm">{new Date(invoice.createdAt).toLocaleString()}</Text>
                            </Flex>

                            <Divider />

                            <Box>
                                <Text fontWeight={700}>Customer</Text>
                                <Text>{invoice.customerName || "Walk-in Customer"}</Text>
                                {invoice.firmName && <Text fontSize="sm">{invoice.firmName}</Text>}
                                {invoice.contactNumber && <Text fontSize="sm">{invoice.contactNumber}</Text>}
                                {invoice.email && <Text fontSize="sm">{invoice.email}</Text>}
                            </Box>

                            <Divider />

                            <Box>
                                <Text fontWeight={700} mb={2}>Items</Text>
                                <VStack align="stretch" spacing={2}>
                                    {(invoice.items || []).map((item) => (
                                        <Flex key={item.id} justify="space-between" gap={3}>
                                            <Box>
                                                <Text fontWeight={600}>{item.productName}</Text>
                                                <Text fontSize="sm" color="gray.600">{item.quantity} x {formatMoney(item.unitPrice)}</Text>
                                            </Box>
                                            <Text fontWeight={600}>{formatMoney(item.lineTotal)}</Text>
                                        </Flex>
                                    ))}
                                </VStack>
                            </Box>

                            <Divider />

                            <VStack align="stretch" spacing={2}>
                                <Flex justify="space-between"><Text>Total (Including GST)</Text><Text>{formatMoney(invoice.subtotal)}</Text></Flex>
                                <Flex justify="space-between"><Text>Discount</Text><Text>- {formatMoney(invoice.discountTotal)}</Text></Flex>
                                <Flex justify="space-between" fontWeight={700}><Text>Grand Total</Text><Text>{formatMoney(invoice.total)}</Text></Flex>
                            </VStack>

                            <Divider />

                            <Box>
                                <Text fontWeight={700} mb={2}>Payments</Text>
                                <VStack align="stretch" spacing={1}>
                                    {Object.entries(paymentSummary).map(([method, amount]) => (
                                        <Flex key={method} justify="space-between">
                                            <Text>{PAYMENT_METHOD_LABELS[method] || method}</Text>
                                            <Text>{formatMoney(amount)}</Text>
                                        </Flex>
                                    ))}
                                </VStack>
                            </Box>
                        </VStack>
                    </Box>
                </ModalBody>
                </ModalContent>
            </Modal>
        </>
    );
}

function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getDateRange(period) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const financialYearStart = year - (month < 3 ? 1 : 0);

    if (period === "current-month") return { startDate: toDateInputValue(new Date(year, month, 1)), endDate: toDateInputValue(today) };
    if (period === "last-month") return { startDate: toDateInputValue(new Date(year, month - 1, 1)), endDate: toDateInputValue(new Date(year, month, 0)) };
    if (period === "current-year") return { startDate: `${year}-01-01`, endDate: toDateInputValue(today) };
    if (period === "last-year") return { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
    if (period === "current-financial-year") return { startDate: `${financialYearStart}-04-01`, endDate: toDateInputValue(today) };
    if (period === "last-financial-year") return { startDate: `${financialYearStart - 1}-04-01`, endDate: `${financialYearStart}-03-31` };
    return { startDate: "", endDate: "" };
}

function ReturnInvoiceModal({ invoice, isOpen, onClose, onReturned }) {
    const [quantities, setQuantities] = useState({});
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    if (!invoice) return null;
    const returnedQuantities = (invoice.returns || []).flatMap((entry) => entry.items || []).reduce((result, item) => {
        result[item.invoiceItemId] = (result[item.invoiceItemId] || 0) + Number(item.quantity || 0);
        return result;
    }, {});

    async function submitReturn() {
        const items = Object.entries(quantities)
            .filter(([, quantity]) => Number(quantity) > 0)
            .map(([invoiceItemId, quantity]) => ({ invoiceItemId: Number(invoiceItemId), quantity: Number(quantity) }));
        if (items.length === 0) {
            setError("Enter a quantity for at least one item.");
            return;
        }
        try {
            setSaving(true);
            const response = await invoiceService.returnInvoiceItems(invoice.id, { items });
            onReturned(response?.data?.message || "Return processed successfully.");
            onClose();
        } catch (err) {
            setError(err?.response?.data?.message || "Unable to process return.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} isCentered>
            <ModalOverlay />
            <ModalContent bg="surface" color="text">
                <ModalHeader>Return items to customer credit</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    <Text color="muted" fontSize="sm" mb={4}>The returned amount is added to {invoice.customerName}&apos;s credit and the stock is restored.</Text>
                    <VStack align="stretch" spacing={3}>
                        {(invoice.items || []).map((item) => {
                            const remaining = Number(item.quantity) - Number(returnedQuantities[item.id] || 0);
                            return (
                                <Flex key={item.id} justify="space-between" align="center" gap={3}>
                                    <Box><Text fontWeight={600}>{item.productName}</Text><Text fontSize="sm" color="muted">Available to return: {remaining}</Text></Box>
                                    <Input type="number" min={0} max={remaining} w="90px" value={quantities[item.id] || ""} isDisabled={remaining <= 0}
                                        onChange={(e) => setQuantities({ ...quantities, [item.id]: Math.min(remaining, Math.max(0, Number(e.target.value || 0))) })} />
                                </Flex>
                            );
                        })}
                    </VStack>
                    {error && <Text color="danger" fontSize="sm" mt={3}>{error}</Text>}
                </ModalBody>
                <ModalFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button colorScheme="orange" ml={3} onClick={submitReturn} isLoading={saving}>Process return</Button></ModalFooter>
            </ModalContent>
        </Modal>
    );
}

export default function InvoiceHistory() {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState("all");
    const [gstFilter, setGstFilter] = useState("all");
    const [dateRange, setDateRange] = useState("current-month");
    const [customStartDate, setCustomStartDate] = useState("");
    const [customEndDate, setCustomEndDate] = useState("");
    const [recordLimit, setRecordLimit] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [returnInvoice, setReturnInvoice] = useState(null);
    const [statusMessage, setStatusMessage] = useState("");

    const filteredInvoices = useMemo(() => {
        const query = searchQuery.trim().toLocaleLowerCase();
        if (!query) return invoices;

        return invoices.filter((invoice) => {
            const paymentMethods = (invoice.payments || [])
                .map((payment) => PAYMENT_METHOD_LABELS[payment.method] || payment.method)
                .join(" ");
            const searchableValues = [
                invoice.invoiceNumber,
                invoice.customerName,
                invoice.firmName,
                invoice.contactNumber,
                invoice.email,
                invoice.gstNo,
                invoice.status,
                paymentMethods,
            ];

            return searchableValues.some((value) => String(value || "").toLocaleLowerCase().includes(query));
        });
    }, [invoices, searchQuery]);

    const effectiveRecordLimit = recordLimit === "" ? "all" : String(Math.max(1, Number(recordLimit) || 1));
    const selectedDates = useMemo(() => dateRange === "custom"
        ? { startDate: customStartDate, endDate: customEndDate }
        : getDateRange(dateRange), [dateRange, customStartDate, customEndDate]);
    const reportRows = useMemo(() => getReportRecords(filteredInvoices, gstFilter, effectiveRecordLimit), [filteredInvoices, gstFilter, effectiveRecordLimit]);
    const reportSummary = useMemo(() => getReportSummary(reportRows), [reportRows]);

    async function loadInvoices() {
        try {
            setLoading(true);
            const res = await invoiceService.getInvoices({
                status: statusFilter === "all" ? undefined : statusFilter,
                startDate: selectedDates.startDate || undefined,
                endDate: selectedDates.endDate || undefined,
            });
            setInvoices(res?.data?.invoices || []);
        } catch (err) {
            console.error(err);
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadInvoices();
    }, [statusFilter, selectedDates]);

    const customerBalanceSummary = useMemo(() => {
        const summary = {};

        filteredInvoices.forEach((invoice) => {
            const customerName = invoice.customerName || "Walk-in Customer";
            const paidAmount = (invoice.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            const balance = Number(invoice.total || 0) - paidAmount;
            summary[customerName] = (summary[customerName] || 0) + balance;
        });

        return Object.entries(summary).map(([customerName, balance]) => ({
            customerName,
            balance,
        }));
    }, [filteredInvoices]);

    const paymentSummary = useMemo(() => {
        const summary = {};
        filteredInvoices.forEach((invoice) => {
            (invoice.payments || []).forEach((payment) => {
                const method = payment.method || "cash";
                summary[method] = (summary[method] || 0) + Number(payment.amount || 0);
            });
        });
        return summary;
    }, [filteredInvoices]);

    return (
        <AppLayout>
            <Box bg="surface" border="1px solid" borderColor="border" borderRadius="xl" p={5}>
                <HStack justify="space-between" mb={4} wrap="wrap" gap={3}>
                    <Box>
                        <Text fontSize="2xl" fontWeight={700}>Invoice history</Text>
                        <Text color="muted">Track receipts, payment methods, and customer balances.</Text>
                    </Box>
                    <HStack spacing={3} wrap="wrap" align="flex-end">
                        <Box>
                            <Text fontSize="xs" color="muted" mb={1}>Search invoices</Text>
                            <Input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Invoice, customer, GST..."
                                width="240px"
                                bg="card"
                                color="text"
                                borderColor="border"
                                _placeholder={{ color: "muted" }}
                                _focusVisible={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(251,146,60,0.5)" }}
                            />
                        </Box>
                        <Box>
                            <Text fontSize="xs" color="muted" mb={1}>Status</Text>
                            <Select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                width="160px"
                                bg="card"
                                color="text"
                                borderColor="border"
                                sx={{ "& option": { backgroundColor: "var(--chakra-colors-card)", color: "var(--chakra-colors-text)" } }}
                                _focusVisible={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(251,146,60,0.5)" }}
                            >
                                <option value="all">All status</option>
                                <option value="paid">Paid</option>
                                <option value="partial">Partial</option>
                            </Select>
                        </Box>

                        <Box>
                            <Text fontSize="xs" color="muted" mb={1}>Period</Text>
                            <Select value={dateRange} onChange={(e) => setDateRange(e.target.value)} width="190px" bg="card" color="text" borderColor="border" sx={{ "& option": { backgroundColor: "var(--chakra-colors-card)", color: "var(--chakra-colors-text)" } }} _focusVisible={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(251,146,60,0.5)" }}>
                                <option value="current-month">Current month</option>
                                <option value="last-month">Last month</option>
                                <option value="current-year">Current year</option>
                                <option value="last-year">Last year</option>
                                <option value="current-financial-year">Current financial year</option>
                                <option value="last-financial-year">Last financial year</option>
                                <option value="custom">Custom range</option>
                            </Select>
                        </Box>

                        {dateRange === "custom" && <>
                            <Box>
                                <Text fontSize="xs" color="muted" mb={1}>From</Text>
                                <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} width="165px" bg="card" color="text" borderColor="border" _focusVisible={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(251,146,60,0.5)" }} />
                            </Box>
                            <Box>
                                <Text fontSize="xs" color="muted" mb={1}>To</Text>
                                <Input type="date" value={customEndDate} min={customStartDate || undefined} onChange={(e) => setCustomEndDate(e.target.value)} width="165px" bg="card" color="text" borderColor="border" _focusVisible={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(251,146,60,0.5)" }} />
                            </Box>
                        </>}

                        <Box>
                            <Text fontSize="xs" color="muted" mb={1}>GST type</Text>
                            <Select
                                value={gstFilter}
                                onChange={(e) => setGstFilter(normalizeGstFilter(e.target.value))}
                                width="170px"
                                bg="card"
                                color="text"
                                borderColor="border"
                                sx={{ "& option": { backgroundColor: "var(--chakra-colors-card)", color: "var(--chakra-colors-text)" } }}
                                _focusVisible={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(251,146,60,0.5)" }}
                            >
                                <option value="all">GST + Non-GST</option>
                                <option value="gst">GST only</option>
                                <option value="non-gst">Non-GST only</option>
                            </Select>
                        </Box>

                        <Box>
                            <Text fontSize="xs" color="muted" mb={1}>Records</Text>
                            <Input
                                type="number"
                                value={recordLimit}
                                min={1}
                                max={filteredInvoices.length || 1}
                                placeholder={`from ${filteredInvoices.length || 0}`}
                                width="150px"
                                bg="card"
                                color="text"
                                borderColor="border"
                                _placeholder={{ color: "muted" }}
                                _focusVisible={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(251,146,60,0.5)" }}
                                onChange={(e) => {
                                    const nextValue = e.target.value;
                                    if (nextValue === "") {
                                        setRecordLimit("");
                                        return;
                                    }

                                    const numericValue = Number(nextValue);
                                    if (!Number.isFinite(numericValue) || numericValue < 1) {
                                        setRecordLimit("");
                                        return;
                                    }

                                    setRecordLimit(String(Math.min(numericValue, filteredInvoices.length || numericValue)));
                                }}
                            />
                        </Box>

                        <Button
                            leftIcon={<LuFileSpreadsheet />}
                            colorScheme="green"
                            variant="solid"
                            bg="green.500"
                            color="white"
                            _hover={{ bg: "green.400" }}
                            onClick={() => downloadExcelFile(reportRows, `gst-report-${Date.now()}.csv`)}
                        >
                            Excel
                        </Button>
                        <Button
                            leftIcon={<LuFileDown />}
                            colorScheme="orange"
                            variant="solid"
                            bg="orange.500"
                            color="white"
                            _hover={{ bg: "orange.400" }}
                            onClick={() => printProfessionalReport(reportRows, "GST Report")}
                        >
                            PDF
                        </Button>
                    </HStack>
                </HStack>

                {statusMessage && <Box bg="rgba(34,197,94,0.12)" border="1px solid" borderColor="green.500" borderRadius="md" p={3} mb={4}><Text color="green.200">{statusMessage}</Text></Box>}

                <Box bg="card" borderRadius="lg" border="1px solid" borderColor="border" p={4} mb={4}>
                    <Text fontSize="sm" fontWeight={700} mb={2}>Export summary</Text>
                    <HStack spacing={4} wrap="wrap">
                        <Text fontSize="sm" color="muted">Records: {reportRows.length}</Text>
                        <Text fontSize="sm" color="muted">Order amount: {formatMoney(reportSummary.total)}</Text>
                        <Text fontSize="sm" color="muted">Tax free products: {formatMoney(reportSummary.taxFreeTotal)}</Text>
                        <Text fontSize="sm" color="muted">5% GST products: {formatMoney(reportSummary.gst5Total)}</Text>
                        <Text fontSize="sm" color="muted">18% GST products: {formatMoney(reportSummary.gst18Total)}</Text>
                    </HStack>
                </Box>

                {loading ? (
                    <Flex justify="center" py={10}><Spinner color="orange.400" /></Flex>
                ) : filteredInvoices.length === 0 ? (
                    <Box border="1px dashed" borderColor="border" borderRadius="lg" p={8} textAlign="center">
                        <Text color="muted">No invoices found.</Text>
                    </Box>
                ) : (
                    <Table variant="simple" size="sm">
                        <Thead>
                            <Tr>
                                <Th>Invoice</Th>
                                <Th>Customer</Th>
                                <Th>Total</Th>
                                <Th>Status</Th>
                                <Th>Payments</Th>
                                <Th>Action</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {filteredInvoices.map((invoice) => {
                                return (
                                    <Tr key={invoice.id}>
                                        <Td>
                                            <Text fontWeight={700}>{invoice.invoiceNumber}</Text>
                                            <Text fontSize="sm" color="muted">{new Date(invoice.createdAt).toLocaleDateString()}</Text>
                                        </Td>
                                        <Td>{invoice.customerName || "Walk-in Customer"}</Td>
                                        <Td>{formatMoney(invoice.total)}</Td>
                                        <Td>
                                            <Badge colorScheme={invoice.status === "paid" ? "green" : "orange"}>
                                                {invoice.status}
                                            </Badge>
                                        </Td>
                                        <Td>{Object.entries((invoice.payments || []).reduce((acc, payment) => {
                                            acc[payment.method] = (acc[payment.method] || 0) + Number(payment.amount || 0);
                                            return acc;
                                        }, {})).map(([method, amount]) => `${PAYMENT_METHOD_LABELS[method] || method}: ${formatMoney(amount)}`).join(" | ") || "—"}</Td>
                                        <Td>
                                            <Button
                                                size="sm"
                                                rightIcon={<LuArrowUpRight />}
                                                variant="outline"
                                                color="white"
                                                borderColor="gray.600"
                                                bg="gray.900"
                                                _hover={{ bg: "gray.700", borderColor: "gray.500" }}
                                                onClick={() => setSelectedInvoice(invoice)}
                                            >
                                                View
                                            </Button>
                                            {invoice.customerId && <Button size="sm" ml={2} leftIcon={<LuUndo2 />} colorScheme="orange" variant="outline" onClick={() => setReturnInvoice(invoice)}>Return</Button>}
                                        </Td>
                                    </Tr>
                                );
                            })}
                        </Tbody>
                    </Table>
                )}
            </Box>

            <Box mt={6} bg="surface" border="1px solid" borderColor="border" borderRadius="xl" p={5}>
                <Text fontSize="xl" fontWeight={700} mb={4}>Payment summary</Text>
                <VStack align="stretch" spacing={3}>
                    {Object.entries(paymentSummary).length === 0 ? (
                        <Text color="muted">No payment records.</Text>
                    ) : Object.entries(paymentSummary).map(([method, amount]) => (
                        <Flex key={method} justify="space-between">
                            <Text>{PAYMENT_METHOD_LABELS[method] || method}</Text>
                            <Text fontWeight={700}>{formatMoney(amount)}</Text>
                        </Flex>
                    ))}
                </VStack>
            </Box>

            <Box mt={6} bg="surface" border="1px solid" borderColor="border" borderRadius="xl" p={5}>
                <Text fontSize="xl" fontWeight={700} mb={4}>Customer balances</Text>
                <VStack align="stretch" spacing={3}>
                    {customerBalanceSummary.length === 0 ? (
                        <Text color="muted">No customer balances yet.</Text>
                    ) : customerBalanceSummary.map((entry) => (
                        <Flex key={entry.customerName} justify="space-between">
                            <Text>{entry.customerName}</Text>
                            <Text fontWeight={700} color={entry.balance > 0 ? "warning" : "positive"}>
                                {entry.balance > 0 ? `Due ${formatMoney(entry.balance)}` : `Advance ${formatMoney(Math.abs(entry.balance))}`}
                            </Text>
                        </Flex>
                    ))}
                </VStack>
            </Box>

            <InvoiceReceiptModal invoice={selectedInvoice} isOpen={Boolean(selectedInvoice)} onClose={() => setSelectedInvoice(null)} />
            <ReturnInvoiceModal key={returnInvoice?.id || "none"} invoice={returnInvoice} isOpen={Boolean(returnInvoice)} onClose={() => setReturnInvoice(null)} onReturned={(message) => { setStatusMessage(message); loadInvoices(); }} />
        </AppLayout>
    );
}
