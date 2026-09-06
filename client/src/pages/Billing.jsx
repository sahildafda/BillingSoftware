import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    Box,
    Button,
    Divider,
    Flex,
    FormControl,
    FormLabel,
    HStack,
    Input,
    InputGroup,
    InputRightElement,
    List,
    ListItem,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    Select,
    Grid,
    GridItem,
    Spinner,
    Text,
    VStack,
} from "@chakra-ui/react";
import { LuPlus, LuScanLine, LuTrash2, LuUserPlus } from "react-icons/lu";

import AppLayout from "../components/layout/AppLayout";
import * as customerService from "../services/customerService";
import * as productService from "../services/productService";

const PAYMENT_OPTIONS = ["cash", "online", "card"];

function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

export default function Billing() {
    const [customerQuery, setCustomerQuery] = useState("");
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [, setCustomerLoading] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [customerForm, setCustomerForm] = useState({ customerName: "", contactNumber: "", email: "" });
    const [customerFormError, setCustomerFormError] = useState("");

    const [barcodeInput, setBarcodeInput] = useState("");
    const barcodeInputRef = useRef(null);
    const [productQuery, setProductQuery] = useState("");
    const [productResults, setProductResults] = useState([]);
    const [productLoading, setProductLoading] = useState(false);
    const [cart, setCart] = useState([]);
    const [payments, setPayments] = useState([{ id: Date.now(), method: "cash", amount: "" }]);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [isFinalizing, setIsFinalizing] = useState(false);

    async function loadCustomers(searchText = "") {
        try {
            setCustomerLoading(true);
            const res = await customerService.getCustomers({ search: searchText || undefined, page: 1, limit: 20 });
            const payload = res?.data;
            const rows = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.customers)
                    ? payload.customers
                    : [];
            setCustomers(rows);
        } catch (err) {
            console.error(err);
            setCustomers([]);
        } finally {
            setCustomerLoading(false);
        }
    }

    function focusBarcodeInput() {
        requestAnimationFrame(() => {
            barcodeInputRef.current?.focus();
        });
    }

    async function loadProducts(searchText = "") {
        try {
            setProductLoading(true);
            const res = await productService.getProducts({ search: searchText || undefined, page: 1, limit: 20 });
            const payload = res?.data;
            const rows = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.products)
                    ? payload.products
                    : Array.isArray(payload?.items)
                        ? payload.items
                        : [];

            setProductResults(rows);
        } catch (err) {
            console.error(err);
            setProductResults([]);
        } finally {
            setProductLoading(false);
        }
    }

    useEffect(() => {
        loadCustomers(customerQuery);
    }, [customerQuery]);

    useEffect(() => {
        if (productQuery.trim()) {
            loadProducts(productQuery);
        } else {
            setProductResults([]);
        }
    }, [productQuery]);
    useEffect(() => {
        focusBarcodeInput();
    }, []);

    const filteredCustomers = useMemo(() => {
        const term = (customerQuery || "").trim().toLowerCase();
        if (!term) return customers.slice(0, 8);
        return customers.filter((customer) => {
            const name = (customer.customerName || "").toLowerCase();
            const email = (customer.email || "").toLowerCase();
            const phone = (customer.contactNumber || "").toLowerCase();
            return name.includes(term) || email.includes(term) || phone.includes(term);
        });
    }, [customers, customerQuery]);

    function addToCart(product) {
        setCart((prev) => {
            const existing = prev.find((item) => item.id === product.id);
            if (existing) {
                return prev.map((item) =>
                    item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                );
            }

            return [
                ...prev,
                {
                    id: product.id,
                    name: product.productName,
                    sku: product.barcode || "N/A",
                    price: Number(product.sellingPrice || product.productPrice || 0),
                    quantity: 1,
                    gst: Number(product.gstPercentage || 0),
                    discount: Number(product.discount || 0),
                    productImages: Array.isArray(product.productImages) ? product.productImages : [],
                },
            ];
        });
        setStatusMessage(`${product.productName} added to cart.`);
    }

    async function handleBarcodePaste(event) {
        const pastedValue = event.clipboardData?.getData("text")?.trim();

        if (!pastedValue) {
            return;
        }

        // Prevent normal paste into the input
        event.preventDefault();

        setBarcodeInput(pastedValue);

        // Immediately search and add the product
        await handleBarcodeScan(pastedValue);
    }

    async function handleBarcodeScan(barcodeValue = barcodeInput) {
        const code = String(barcodeValue || "").trim();

        if (!code) {
            setStatusMessage("Please scan or enter a barcode.");
            focusBarcodeInput();
            return;
        }

        try {
            setProductLoading(true);
            setStatusMessage("");

            const response = await productService.getProductByBarcode(code);

            const product = response?.data?.product;

            if (!product) {
                setStatusMessage(`No product found for barcode: ${code}`);
                return;
            }

            addToCart(product);

            setBarcodeInput("");
        } catch (error) {
            console.error("Barcode scan error:", error);

            if (error?.response?.status === 404) {
                setStatusMessage(`No product found for barcode: ${code}`);
            } else if (error?.response?.status === 401) {
                setStatusMessage("Your session has expired. Please login again.");
            } else {
                setStatusMessage(
                    error?.response?.data?.message ||
                    "Could not find product for this barcode."
                );
            }
        } finally {
            setProductLoading(false);

            // Keep barcode input ready for next scan
            focusBarcodeInput();
        }
    }

    function updateCartQuantity(id, nextQty) {
        if (nextQty <= 0) {
            setCart((prev) => prev.filter((item) => item.id !== id));
            return;
        }
        setCart((prev) => prev.map((item) => item.id === id ? { ...item, quantity: nextQty } : item));
    }

    function updatePaymentRow(id, field, value) {
        setPayments((prev) => prev.map((row) => {
            if (row.id !== id) {
                return row;
            }

            if (field === "amount") {
                const raw = String(value ?? "");

                if (raw === "") {
                    return { ...row, amount: "" };
                }

                if (/^\d*\.?\d{0,2}$/.test(raw) || raw === ".") {
                    return { ...row, amount: raw };
                }

                return row;
            }

            return { ...row, [field]: value };
        }));
    }

    function addPaymentRow() {
        setPayments((prev) => [...prev, { id: Date.now() + Math.random(), method: "cash", amount: "" }]);
    }

    function removePaymentRow(id) {
        setPayments((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
    }

    async function handleAddCustomer() {
        const name = customerForm.customerName.trim();
        if (!name) {
            setCustomerFormError("Customer name is required.");
            return;
        }

        try {
            const response = await customerService.createCustomer({
                customerName: name,
                contactNumber: customerForm.contactNumber.trim(),
                email: customerForm.email.trim(),
                credit: customerForm.credit || 0,
                firmName: customerForm.firmName?.trim() || "",
                gstNo: customerForm.gstNo?.trim() || ""
            });
            const created = response?.data?.customer || response?.data;
            setSelectedCustomer(created);
            setCustomerQuery(created?.customerName || name);
            setCustomerForm({ customerName: "", contactNumber: "", email: "" });
            setCustomerFormError("");
            setIsCustomerModalOpen(false);
            setStatusMessage(`${created?.customerName || name} added to customers.`);

            // Automatically focus barcode input
            focusBarcodeInput();
        } catch (err) {
            const message = err?.response?.data?.message || "Could not add customer.";
            setCustomerFormError(message);
        }
    }

    const grossTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const gstTotal = 0;
    const subtotal = grossTotal;
    const discountTotal = cart.reduce((sum, item) => {
        const discountValue = item.price * item.quantity * (Number(item.discount || 0) / 100);
        return sum + discountValue;
    }, 0);
    const exactTotal = grossTotal - discountTotal;
    const grandTotal = Math.round(exactTotal);
    const roundingAdjustment = grandTotal - exactTotal;
    const creditAvailable = Number(selectedCustomer?.credit || 0);
    const creditUsed = Math.min(creditAvailable, grandTotal);
    const paymentTotal = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const cashReceived = payments.filter((row) => row.method === "cash")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const changeGiven = Math.max(0, Math.round((paymentTotal + creditUsed - grandTotal) * 100) / 100);
    const invalidOverpayment = Math.round(changeGiven * 100) > Math.round(cashReceived * 100);
    const balanceDue = Math.max(0, grandTotal - creditUsed - paymentTotal);
    const canFinalize = cart.length > 0 && balanceDue <= 0.01 && !invalidOverpayment
        && payments.every((row) => Number.isFinite(Number(row.amount || 0)) && Number(row.amount || 0) >= 0);
    const showCustomerSuggestions = !selectedCustomer && customerQuery.trim() && filteredCustomers.length > 0;

    async function finalizeInvoice() {
        if (!canFinalize || isFinalizing) {
            if (!canFinalize) {
                setStatusMessage(
                    "Payment total must cover the amount remaining after customer credit."
                );
            }
            return;
        }

        const payload = {
            customer: selectedCustomer || {
                customerName: customerQuery || "Walk-in Customer"
            },
            customerId: selectedCustomer?.id || null,
            items: cart.map((item) => ({
                productId: item.id,
                productName: item.name,
                sku: item.sku,
                quantity: item.quantity,
                unitPrice: item.price,
                gstPercent: item.gst,
                discountPercent: item.discount,
            })),
            payments: payments
                .filter((payment) => Number(payment.amount || 0) > 0)
                .map((payment) => ({
                    method: payment.method,
                    amount: Number(payment.amount || 0),
                })),
        };

        try {
            setIsFinalizing(true);
            setStatusMessage("Finalizing billing...");

            const token = localStorage.getItem("authToken");

            const response = await axios.post(
                "/api/billing/invoices",
                payload,
                {
                    headers: token
                        ? { Authorization: `Bearer ${token}` }
                        : {},
                }
            );

            const invoice = response?.data?.invoice;

            setStatusMessage(
                `Invoice ${invoice?.invoiceNumber || "created"} saved successfully.${invoice?.changeGiven > 0 ? ` Change to give: ${formatMoney(invoice.changeGiven)}.` : ""}`
            );

            setCart([]);
            setPayments([
                {
                    id: Date.now(),
                    method: "cash",
                    amount: ""
                }
            ]);
            setCustomerQuery("");
            setSelectedCustomer(null);
            setIsPaymentModalOpen(false);

        } catch (err) {
            const message =
                err?.response?.data?.message ||
                "Unable to save invoice.";

            setStatusMessage(message);
            console.error(err);

        } finally {
            setIsFinalizing(false);
            focusBarcodeInput();
        }
    }

    return (
        <AppLayout>
            <Grid templateColumns={{ base: "1fr", xl: "minmax(320px, 0.85fr) minmax(480px, 1.5fr)" }} gap={5} alignItems="start">
                <GridItem bg="surface" border="1px solid" borderColor="border" borderRadius="xl" p={5} display="flex" flexDirection="column">
                    <HStack justify="space-between" mb={4}>
                        <Text fontSize="2xl" fontWeight={700}>Billing</Text>
                        <Text color="muted" fontSize="sm">Select customer and products</Text>
                    </HStack>

                    <VStack spacing={4} align="stretch">
                        <Box>
                            <Text fontWeight={600} mb={2}>Customer</Text>
                            <InputGroup>
                                <Input
                                    value={customerQuery}
                                    onChange={(e) => {
                                        setCustomerQuery(e.target.value);
                                        setSelectedCustomer(null);
                                    }}
                                    placeholder="Search customer or type name"
                                    bg="card"
                                    borderColor="border"
                                />
                                <InputRightElement width="auto" pr={2}>
                                    <Button size="sm" colorScheme="orange" variant="ghost" onClick={() => setIsCustomerModalOpen(true)}>
                                        <LuUserPlus size={16} />
                                    </Button>
                                </InputRightElement>
                            </InputGroup>

                            {showCustomerSuggestions && (
                                <Box mt={2} bg="card" border="1px solid" borderColor="border" borderRadius="md" maxH="220px" overflowY="auto">
                                    <List spacing={2} p={2}>
                                        {filteredCustomers.map((customer) => (
                                            <ListItem
                                                key={customer.id || customer._id}
                                                cursor="pointer"
                                                px={3}
                                                py={2}
                                                borderRadius="md"
                                                _hover={{ bg: "rgba(249,115,22,0.12)" }}
                                                onClick={() => {
                                                    setSelectedCustomer(customer);
                                                    setCustomerQuery(customer.customerName || "");
                                                }}
                                            >
                                                <Text fontWeight={600}>{customer.customerName}</Text>
                                                <Text fontSize="sm" color="muted">{customer.contactNumber || customer.email || "No contact info"}</Text>
                                            </ListItem>
                                        ))}
                                    </List>
                                </Box>
                            )}

                            {selectedCustomer && (
                                <Box mt={3} bg="card" border="1px solid" borderColor="border" borderRadius="md" p={3}>
                                    <Text fontWeight={600}>{selectedCustomer.customerName}</Text>
                                    <Text fontSize="sm" color="muted">{selectedCustomer.contactNumber || selectedCustomer.email || "Walk-in customer"}</Text>
                                    <Text fontSize="sm" color="positive">Available credit: {formatMoney(selectedCustomer.credit)}</Text>
                                </Box>
                            )}
                        </Box>

                        <Box>
                            <Text fontWeight={600} mb={2}>Scan product by barcode / SKU</Text>
                            <HStack>
                                <Input
                                    ref={barcodeInputRef}
                                    value={barcodeInput}
                                    onChange={(e) => setBarcodeInput(e.target.value)}
                                    onPaste={handleBarcodePaste}
                                    placeholder="Scan barcode or SKU"
                                    bg="card"
                                    borderColor="border"
                                    autoComplete="off"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleBarcodeScan();
                                        }
                                    }}
                                />
                                <Button leftIcon={<LuScanLine />} colorScheme="orange" onClick={handleBarcodeScan}>Add</Button>
                            </HStack>
                        </Box>

                        <Box>
                            <Text fontWeight={600} mb={2}>Search product by name</Text>
                            <Input
                                value={productQuery}
                                onChange={(e) => setProductQuery(e.target.value)}
                                placeholder="Search product name or sku"
                                bg="card"
                                borderColor="border"
                            />
                            {productLoading ? (
                                <Flex justify="center" py={3}><Spinner size="sm" color="orange.400" /></Flex>
                            ) : productResults.length > 0 && (
                                <Box mt={2} bg="card" border="1px solid" borderColor="border" borderRadius="md" maxH="220px" overflowY="auto">
                                    <List spacing={2} p={2}>
                                        {productResults.map((product) => (
                                            <ListItem
                                                key={product.id || product._id}
                                                px={3}
                                                py={2}
                                                borderRadius="md"
                                                cursor="pointer"
                                                _hover={{ bg: "rgba(249,115,22,0.12)" }}
                                                onClick={() => addToCart(product)}
                                            >
                                                <HStack justify="space-between">
                                                    <Box>
                                                        <Text fontWeight={600}>{product.productName}</Text>
                                                        <Text fontSize="sm" color="muted">{product.barcode || "No barcode"}</Text>
                                                    </Box>
                                                    <Text fontWeight={600}>{formatMoney(product.sellingPrice || product.productPrice || 0)}</Text>
                                                </HStack>
                                            </ListItem>
                                        ))}
                                    </List>
                                </Box>
                            )}
                        </Box>
                    </VStack>
                </GridItem>

                <GridItem bg="surface" border="1px solid" borderColor="border" borderRadius="xl" p={5} display="flex" flexDirection="column">
                    <HStack justify="space-between" mb={4}>
                        <Text fontSize="xl" fontWeight={700}>Cart</Text>
                        <Text color="muted">{cart.length} items</Text>
                    </HStack>

                    <VStack spacing={2} align="stretch" maxH="300px" overflowY="auto" pr={1}>
                        {cart.length === 0 ? (
                            <Box bg="card" border="1px dashed" borderColor="border" borderRadius="md" p={6} textAlign="center">
                                <Text color="muted">No items in cart yet.</Text>
                            </Box>
                        ) : (
                            cart.map((item) => (
                                <Box key={item.id} bg="card" border="1px solid" borderColor="border" borderRadius="md" px={3} py={2}>
                                    <HStack spacing={3} justify="space-between">
                                        <Box flex={1} minW={0}>
                                            <Text fontWeight={700}>{item.name}</Text>
                                            <Text fontSize="xs" color="muted" noOfLines={1}>SKU: {item.sku}</Text>
                                        </Box>
                                        <HStack spacing={1}>
                                            <Button
                                                size="xs"
                                                minW="28px"
                                                h="28px"
                                                border="1px solid"
                                                borderColor="orange.500"
                                                bg="rgba(249,115,22,0.12)"
                                                color="primary"
                                                _hover={{ bg: "rgba(249,115,22,0.22)" }}
                                                onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                                            >
                                                -
                                            </Button>
                                            <Text minW="24px" textAlign="center" fontWeight={700} fontSize="sm">{item.quantity}</Text>
                                            <Button
                                                size="xs"
                                                minW="28px"
                                                h="28px"
                                                border="1px solid"
                                                borderColor="orange.500"
                                                bg="rgba(249,115,22,0.12)"
                                                color="primary"
                                                _hover={{ bg: "rgba(249,115,22,0.22)" }}
                                                onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                                            >
                                                +
                                            </Button>
                                        </HStack>
                                        <Text fontWeight={700} minW="72px" textAlign="right">{formatMoney(item.price * item.quantity)}</Text>
                                        <Button variant="ghost" colorScheme="red" size="xs" minW="28px" h="28px" onClick={() => updateCartQuantity(item.id, 0)} aria-label={`Remove ${item.name}`}>
                                            <LuTrash2 size={13} />
                                        </Button>
                                    </HStack>
                                </Box>
                            ))
                        )}
                    </VStack>

                    <Box mt={5} pt={5} borderTop="1px solid" borderColor="border">
                        <VStack spacing={2} align="stretch" mb={4}>
                            <Flex justify="space-between"><Text color="muted">Amount</Text><Text>{formatMoney(subtotal)}</Text></Flex>
                            <Flex justify="space-between"><Text color="muted">Discount</Text><Text>- {formatMoney(discountTotal)}</Text></Flex>
                            {Math.abs(roundingAdjustment) >= 0.005 && <Flex justify="space-between"><Text color="muted">Rounding</Text><Text>{roundingAdjustment >= 0 ? "+ " : "- "}{formatMoney(Math.abs(roundingAdjustment))}</Text></Flex>}
                            {selectedCustomer && <Flex justify="space-between"><Text color="muted">Customer credit</Text><Text color="positive">- {formatMoney(creditUsed)}</Text></Flex>}
                            <Flex justify="space-between" align="center" pt={2} fontWeight={800} fontSize="xl"><Text>Total</Text><Text color="primary">{formatMoney(grandTotal)}</Text></Flex>
                        </VStack>
                        {statusMessage && <Box mb={4} bg="rgba(249,115,22,0.12)" border="1px solid" borderColor="orange.500" color="warning" borderRadius="md" p={3}><Text fontSize="sm">{statusMessage}</Text></Box>}
                        <Button colorScheme="orange" size="lg" w="100%" isDisabled={cart.length === 0} onClick={() => setIsPaymentModalOpen(true)}>Finalize billing</Button>
                    </Box>
                </GridItem>

                <Modal isOpen={isPaymentModalOpen} onClose={() => !isFinalizing && setIsPaymentModalOpen(false)} isCentered size="xl">
                    <ModalOverlay />
                    <ModalContent bg="surface" color="text">
                        <ModalHeader>Complete payment</ModalHeader>
                        <ModalCloseButton isDisabled={isFinalizing} />
                        <ModalBody pb={6}>
                            <Text color="muted" mb={4}>For cash, enter the amount received from the customer. Change is calculated automatically.</Text>
                            <VStack spacing={3} align="stretch">
                        {payments.map((payment) => (
                            <Box key={payment.id} bg="card" border="1px solid" borderColor="border" borderRadius="md" p={3}>
                                <HStack spacing={2} align="center">
                                    <Select
                                        value={payment.method}
                                        onChange={(e) => updatePaymentRow(payment.id, "method", e.target.value)}
                                        bg="card"
                                        border="1px solid"
                                        borderColor="rgba(249,115,22,0.9)"
                                        color="text"
                                        borderRadius="md"
                                        height="48px"
                                        minW="120px"
                                        _focus={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(249,115,22,0.5)" }}
                                        sx={{
                                            "option": {
                                                backgroundColor: "var(--chakra-colors-card)",
                                                color: "var(--chakra-colors-text)",
                                            },
                                        }}
                                    >
                                        {PAYMENT_OPTIONS.map((method) => (
                                            <option key={method} value={method}>{method}</option>
                                        ))}
                                    </Select>
                                    <Input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        min="0"
                                        value={payment.amount}
                                        aria-label={payment.method === "cash" ? "Cash received" : "Payment amount"}
                                        onChange={(e) => updatePaymentRow(payment.id, "amount", e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                        placeholder={balanceDue > 0 ? `Amount (₹${Math.ceil(balanceDue)})` : "Amount"}
                                        bg="card"
                                        border="1px solid"
                                        borderColor="rgba(249,115,22,0.9)"
                                        color="text"
                                        borderRadius="md"
                                        height="48px"
                                        _focus={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(249,115,22,0.5)" }}
                                    />
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        bg="rgba(239,68,68,0.12)"
                                        color="danger"
                                        border="1px solid"
                                        borderColor="red.400"
                                        _hover={{ bg: "rgba(239,68,68,0.2)" }}
                                        onClick={() => removePaymentRow(payment.id)}
                                        isDisabled={payments.length === 1}
                                        aria-label="Remove payment method"
                                        minW="40px"
                                        h="48px"
                                    >
                                        <LuTrash2 size={14} />
                                    </Button>
                                </HStack>
                            </Box>
                        ))}

                        <Button leftIcon={<LuPlus />} variant="outline" colorScheme="orange" onClick={addPaymentRow}>Add payment method</Button>

                        <Divider />

                        <VStack spacing={2} align="stretch">
                            <Flex justify="space-between"><Text color="muted">Amount</Text><Text>{formatMoney(subtotal)}</Text></Flex>
                            <Flex justify="space-between"><Text color="muted">Discount</Text><Text>- {formatMoney(discountTotal)}</Text></Flex>
                            {Math.abs(roundingAdjustment) >= 0.005 && <Flex justify="space-between"><Text color="muted">Rounding</Text><Text>{roundingAdjustment >= 0 ? "+ " : "- "}{formatMoney(Math.abs(roundingAdjustment))}</Text></Flex>}
                            <Flex justify="space-between" fontWeight={700}><Text>Total</Text><Text>{formatMoney(grandTotal)}</Text></Flex>
                            {selectedCustomer && <Flex justify="space-between"><Text color="muted">Customer credit applied</Text><Text color="positive">- {formatMoney(creditUsed)}</Text></Flex>}
                            <Flex justify="space-between"><Text color="muted">Amount received</Text><Text>{formatMoney(paymentTotal)}</Text></Flex>
                            {cashReceived > 0 && !invalidOverpayment && (
                                <Flex justify="space-between" fontWeight={700} color="positive">
                                    <Text>Change to give</Text><Text>{formatMoney(changeGiven)}</Text>
                                </Flex>
                            )}
                            {invalidOverpayment && <Text color="danger">Non-cash payments cannot exceed the amount due. Check the payment amounts.</Text>}
                            <Flex justify="space-between" fontWeight={700} color={balanceDue <= 0 ? "positive" : "warning"}>
                                <Text>Balance</Text>
                                <Text>{formatMoney(balanceDue)}</Text>
                            </Flex>
                        </VStack>

                        {statusMessage && (
                            <Box bg="rgba(249,115,22,0.12)" border="1px solid" borderColor="orange.500" color="warning" borderRadius="md" p={3}>
                                <Text fontSize="sm">{statusMessage}</Text>
                            </Box>
                        )}

                        <Button
                            colorScheme="orange"
                            size="lg"
                            isDisabled={!canFinalize}
                            isLoading={isFinalizing}
                            loadingText="Finalizing..."
                            onClick={finalizeInvoice}
                        >
                            Confirm &amp; save invoice
                        </Button>
                            </VStack>
                        </ModalBody>
                    </ModalContent>
                </Modal>
            </Grid>

            <Modal isOpen={isCustomerModalOpen} onClose={() => setIsCustomerModalOpen(false)} isCentered>
                <ModalOverlay />
                <ModalContent bg="surface" color="text">
                    <ModalHeader>Add new customer</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <VStack spacing={4}>
                            <FormControl>
                                <FormLabel>Customer name</FormLabel>
                                <Input
                                    value={customerForm.customerName}
                                    onChange={(e) => setCustomerForm({ ...customerForm, customerName: e.target.value })}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Mobile number</FormLabel>
                                <Input
                                    type="number"
                                    value={customerForm.contactNumber}
                                    onChange={(e) => setCustomerForm({ ...customerForm, contactNumber: e.target.value })}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Email</FormLabel>
                                <Input
                                    value={customerForm.email}
                                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Credit</FormLabel>
                                <Input
                                    type="number"
                                    value={customerForm.credit}
                                    onChange={(e) => setCustomerForm({ ...customerForm, credit: e.target.value })}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Firm Name</FormLabel>
                                <Input
                                    type="text"
                                    value={customerForm.firmName}
                                    onChange={(e) => setCustomerForm({ ...customerForm, firmName: e.target.value })}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>GST NO</FormLabel>
                                <Input
                                    type="text"
                                    value={customerForm.gstNo}
                                    onChange={(e) => setCustomerForm({ ...customerForm, gstNo: e.target.value })}
                                />
                            </FormControl>
                            {customerFormError && (
                                <Text color="danger" fontSize="sm">{customerFormError}</Text>
                            )}
                        </VStack>
                    </ModalBody>
                    <ModalFooter gap={3}>
                        <Button
                            variant="outline"
                            color="text"
                            borderColor="border"
                            _hover={{ bg: "card" }}
                            onClick={() => setIsCustomerModalOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button colorScheme="orange" onClick={handleAddCustomer}>Save customer</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </AppLayout>
    );
}
