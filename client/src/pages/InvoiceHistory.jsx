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
import { LuReceipt, LuPrinter, LuArrowUpRight, LuFileDown, LuFileSpreadsheet } from "react-icons/lu";

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
        <Modal isOpen={isOpen} onClose={onClose} size="xl">
            <ModalOverlay />
            <ModalContent bg="white" color="black" p={2}>
                <ModalHeader>
                    <HStack justify="space-between">
                        <Text>Invoice Receipt</Text>
                        <Button size="sm" leftIcon={<LuPrinter />} onClick={printReceipt}>Print</Button>
                    </HStack>
                </ModalHeader>
                <ModalCloseButton color="black" />
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
                                <Flex justify="space-between"><Text>Subtotal</Text><Text>{formatMoney(invoice.subtotal)}</Text></Flex>
                                <Flex justify="space-between"><Text>GST</Text><Text>{formatMoney(invoice.gstTotal)}</Text></Flex>
                                <Flex justify="space-between"><Text>Discount</Text><Text>- {formatMoney(invoice.discountTotal)}</Text></Flex>
                                <Flex justify="space-between" fontWeight={700}><Text>Total</Text><Text>{formatMoney(invoice.total)}</Text></Flex>
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
    );
}

export default function InvoiceHistory() {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState("all");
    const [gstFilter, setGstFilter] = useState("all");
    const [recordLimit, setRecordLimit] = useState("");
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    const effectiveRecordLimit = recordLimit === "" ? "all" : String(Math.max(1, Number(recordLimit) || 1));
    const reportRows = useMemo(() => getReportRecords(invoices, gstFilter, effectiveRecordLimit), [invoices, gstFilter, effectiveRecordLimit]);
    const reportSummary = useMemo(() => getReportSummary(reportRows), [reportRows]);

    async function loadInvoices() {
        try {
            setLoading(true);
            const res = await invoiceService.getInvoices({ status: statusFilter === "all" ? undefined : statusFilter });
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
    }, [statusFilter]);

    const customerBalanceSummary = useMemo(() => {
        const summary = {};

        invoices.forEach((invoice) => {
            const customerName = invoice.customerName || "Walk-in Customer";
            const paidAmount = (invoice.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            const balance = Number(invoice.total || 0) - paidAmount;
            summary[customerName] = (summary[customerName] || 0) + balance;
        });

        return Object.entries(summary).map(([customerName, balance]) => ({
            customerName,
            balance,
        }));
    }, [invoices]);

    const paymentSummary = useMemo(() => {
        const summary = {};
        invoices.forEach((invoice) => {
            (invoice.payments || []).forEach((payment) => {
                const method = payment.method || "cash";
                summary[method] = (summary[method] || 0) + Number(payment.amount || 0);
            });
        });
        return summary;
    }, [invoices]);

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
                            <Text fontSize="xs" color="muted" mb={1}>Status</Text>
                            <Select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                width="160px"
                                bg="gray.800"
                                color="white"
                                borderColor="gray.600"
                                _focusVisible={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(251,146,60,0.5)" }}
                            >
                                <option value="all">All status</option>
                                <option value="paid">Paid</option>
                                <option value="partial">Partial</option>
                            </Select>
                        </Box>

                        <Box>
                            <Text fontSize="xs" color="muted" mb={1}>GST type</Text>
                            <Select
                                value={gstFilter}
                                onChange={(e) => setGstFilter(normalizeGstFilter(e.target.value))}
                                width="170px"
                                bg="gray.800"
                                color="white"
                                borderColor="gray.600"
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
                                max={invoices.length || 1}
                                placeholder={`from ${invoices.length || 0}`}
                                width="150px"
                                bg="gray.800"
                                color="white"
                                borderColor="gray.600"
                                _placeholder={{ color: "gray.400" }}
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

                                    setRecordLimit(String(Math.min(numericValue, invoices.length || numericValue)));
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

                <Box bg="card" borderRadius="lg" border="1px solid" borderColor="border" p={4} mb={4}>
                    <Text fontSize="sm" fontWeight={700} mb={2}>Export summary</Text>
                    <HStack spacing={4} wrap="wrap">
                        <Text fontSize="sm" color="muted">Records: {reportRows.length}</Text>
                        <Text fontSize="sm" color="muted">Taxable Value: {formatMoney(reportSummary.taxableValue)}</Text>
                        <Text fontSize="sm" color="muted">GST: {formatMoney(reportSummary.gst)}</Text>
                        <Text fontSize="sm" color="muted">Total: {formatMoney(reportSummary.total)}</Text>
                    </HStack>
                </Box>

                {loading ? (
                    <Flex justify="center" py={10}><Spinner color="orange.400" /></Flex>
                ) : invoices.length === 0 ? (
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
                            {invoices.map((invoice) => {
                                const totalPaid = (invoice.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
                                const balance = Number(invoice.total || 0) - totalPaid;
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
                            <Text fontWeight={700} color={entry.balance > 0 ? "orange.300" : "green.300"}>
                                {entry.balance > 0 ? `Due ${formatMoney(entry.balance)}` : `Advance ${formatMoney(Math.abs(entry.balance))}`}
                            </Text>
                        </Flex>
                    ))}
                </VStack>
            </Box>

            <InvoiceReceiptModal invoice={selectedInvoice} isOpen={Boolean(selectedInvoice)} onClose={() => setSelectedInvoice(null)} />
        </AppLayout>
    );
}
