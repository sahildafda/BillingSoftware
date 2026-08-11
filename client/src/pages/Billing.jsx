import { useEffect, useMemo, useState } from "react";
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
    NumberInput,
    NumberInputField,
    Select,
    SimpleGrid,
    Spinner,
    Stack,
    Text,
    VStack,
} from "@chakra-ui/react";
import { LuPlus, LuReceipt, LuSearch, LuScanLine, LuTrash2, LuUserPlus } from "react-icons/lu";

import AppLayout from "../components/layout/AppLayout";
import * as customerService from "../services/customerService";
import * as productService from "../services/productService";

const PAYMENT_OPTIONS = ["cash", "online", "card"];

function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default function Billing() {
    const [customerQuery, setCustomerQuery] = useState("");
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerLoading, setCustomerLoading] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [customerForm, setCustomerForm] = useState({ customerName: "", contactNumber: "", email: "" });
    const [customerFormError, setCustomerFormError] = useState("");

    const [barcodeInput, setBarcodeInput] = useState("");
    const [productQuery, setProductQuery] = useState("");
    const [productResults, setProductResults] = useState([]);
    const [productLoading, setProductLoading] = useState(false);
    const [cart, setCart] = useState([]);
    const [payments, setPayments] = useState([{ id: Date.now(), method: "cash", amount: "0" }]);
    const [statusMessage, setStatusMessage] = useState("");

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

    function handleBarcodeScan() {
        const code = barcodeInput.trim();
        if (!code) {
            setStatusMessage("Enter item barcode or SKU.");
            return;
        }

        const exactMatch = productResults.find((product) => String(product.barcode || "").toLowerCase() === code.toLowerCase())
            || productResults.find((product) => String(product.productName || "").toLowerCase() === code.toLowerCase());

        if (exactMatch) {
            addToCart(exactMatch);
            setBarcodeInput("");
            return;
        }

        productService.getProducts({ search: code, page: 1, limit: 10 })
            .then((res) => {
                const payload = res?.data;
                const rows = Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload?.products)
                        ? payload.products
                        : Array.isArray(payload?.items)
                            ? payload.items
                            : [];
                const match = rows.find((product) => String(product.barcode || "").toLowerCase() === code.toLowerCase())
                    || rows.find((product) => String(product.productName || "").toLowerCase() === code.toLowerCase());

                if (match) {
                    addToCart(match);
                    setBarcodeInput("");
                    return;
                }

                setStatusMessage("No product matches that barcode or SKU.");
            })
            .catch((err) => {
                console.error(err);
                setStatusMessage("Could not find product for that barcode.");
            });
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
        setPayments((prev) => [...prev, { id: Date.now() + Math.random(), method: "cash", amount: "0" }]);
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
            });
            const created = response?.data?.customer || response?.data;
            setSelectedCustomer(created);
            setCustomerQuery(created?.customerName || name);
            setCustomerForm({ customerName: "", contactNumber: "", email: "" });
            setCustomerFormError("");
            setIsCustomerModalOpen(false);
            setStatusMessage(`${created?.customerName || name} added to customers.`);
        } catch (err) {
            const message = err?.response?.data?.message || "Could not add customer.";
            setCustomerFormError(message);
        }
    }

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const gstTotal = cart.reduce((sum, item) => {
        const gstValue = item.price * item.quantity * (Number(item.gst || 0) / 100);
        return sum + gstValue;
    }, 0);
    const discountTotal = cart.reduce((sum, item) => {
        const discountValue = item.price * item.quantity * (Number(item.discount || 0) / 100);
        return sum + discountValue;
    }, 0);
    const grandTotal = subtotal + gstTotal - discountTotal;
    const creditAvailable = Number(selectedCustomer?.credit || 0);
    const creditUsed = Math.min(creditAvailable, grandTotal);
    const paymentTotal = payments.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const balanceDue = Math.max(0, grandTotal - creditUsed - paymentTotal);
    const canFinalize = cart.length > 0 && balanceDue <= 0.01;
    const showCustomerSuggestions = !selectedCustomer && customerQuery.trim() && filteredCustomers.length > 0;

    async function finalizeInvoice() {
        if (!canFinalize) {
            setStatusMessage("Payment total must cover the amount remaining after customer credit.");
            return;
        }

        const payload = {
            customer: selectedCustomer || { customerName: customerQuery || "Walk-in Customer" },
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
            payments: payments.filter((payment) => Number(payment.amount || 0) > 0).map((payment) => ({
                method: payment.method,
                amount: Number(payment.amount || 0),
            })),
        };

        try {
            const token = localStorage.getItem("authToken");
            const response = await axios.post("/api/billing/invoices", payload, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const invoice = response?.data?.invoice;
            setStatusMessage(`Invoice ${invoice?.invoiceNumber || "created"} saved successfully.`);
            setCart([]);
            setPayments([{ id: Date.now(), method: "cash", amount: "0" }]);
            setCustomerQuery("");
            setSelectedCustomer(null);
        } catch (err) {
            const message = err?.response?.data?.message || "Unable to save invoice.";
            setStatusMessage(message);
            console.error(err);
        }
    }

    return (
        <AppLayout>
            <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={6}>
                <Box bg="surface" border="1px solid" borderColor="border" borderRadius="xl" p={5} minH="600px">
                    <HStack justify="space-between" mb={4}>
                        <Text fontSize="2xl" fontWeight={700}>Billing</Text>
                        <Button leftIcon={<LuReceipt />} colorScheme="orange" size="sm">New Bill</Button>
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
                                    <Text fontSize="sm" color="green.300">Available credit: {formatMoney(selectedCustomer.credit)}</Text>
                                </Box>
                            )}
                        </Box>

                        <Box>
                            <Text fontWeight={600} mb={2}>Scan product by barcode / SKU</Text>
                            <HStack>
                                <Input
                                    value={barcodeInput}
                                    onChange={(e) => setBarcodeInput(e.target.value)}
                                    placeholder="Scan barcode or SKU"
                                    bg="card"
                                    borderColor="border"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleBarcodeScan();
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
                </Box>

                <Box bg="surface" border="1px solid" borderColor="border" borderRadius="xl" p={5} minH="600px">
                    <HStack justify="space-between" mb={4}>
                        <Text fontSize="xl" fontWeight={700}>Cart</Text>
                        <Text color="muted">{cart.length} items</Text>
                    </HStack>

                    <VStack spacing={3} align="stretch" maxH="500px" overflowY="auto" pr={1}>
                        {cart.length === 0 ? (
                            <Box bg="card" border="1px dashed" borderColor="border" borderRadius="md" p={6} textAlign="center">
                                <Text color="muted">No items in cart yet.</Text>
                            </Box>
                        ) : (
                            cart.map((item) => (
                                <Box key={item.id} bg="card" border="1px solid" borderColor="border" borderRadius="md" p={3}>
                                    <HStack align="start" justify="space-between">
                                        <Box flex={1}>
                                            <Text fontWeight={700}>{item.name}</Text>
                                            <Text fontSize="sm" color="muted">SKU: {item.sku}</Text>
                                        </Box>
                                        <Button variant="ghost" colorScheme="red" size="sm" onClick={() => updateCartQuantity(item.id, 0)}>
                                            <LuTrash2 size={14} />
                                        </Button>
                                    </HStack>

                                    <HStack mt={3} justify="space-between">
                                        <HStack spacing={2}>
                                            <Button
                                                size="sm"
                                                minW="36px"
                                                h="36px"
                                                border="1px solid"
                                                borderColor="orange.500"
                                                bg="rgba(249,115,22,0.12)"
                                                color="orange.200"
                                                _hover={{ bg: "rgba(249,115,22,0.22)" }}
                                                onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                                            >
                                                -
                                            </Button>
                                            <Text minW="22px" textAlign="center" fontWeight={700}>{item.quantity}</Text>
                                            <Button
                                                size="sm"
                                                minW="36px"
                                                h="36px"
                                                border="1px solid"
                                                borderColor="orange.500"
                                                bg="rgba(249,115,22,0.12)"
                                                color="orange.200"
                                                _hover={{ bg: "rgba(249,115,22,0.22)" }}
                                                onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                                            >
                                                +
                                            </Button>
                                        </HStack>
                                        <Text fontWeight={700}>{formatMoney(item.price * item.quantity)}</Text>
                                    </HStack>
                                </Box>
                            ))
                        )}
                    </VStack>
                </Box>

                <Box bg="surface" border="1px solid" borderColor="border" borderRadius="xl" p={5} minH="600px">
                    <Text fontSize="xl" fontWeight={700} mb={4}>Payment</Text>

                    <VStack spacing={3} align="stretch">
                        {payments.map((payment) => (
                            <Box key={payment.id} bg="card" border="1px solid" borderColor="border" borderRadius="md" p={3}>
                                <HStack spacing={2} align="center">
                                    <Select
                                        value={payment.method}
                                        onChange={(e) => updatePaymentRow(payment.id, "method", e.target.value)}
                                        bg="rgba(17,24,39,0.72)"
                                        border="1px solid"
                                        borderColor="rgba(249,115,22,0.9)"
                                        color="white"
                                        borderRadius="md"
                                        height="48px"
                                        minW="120px"
                                        _focus={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(249,115,22,0.5)" }}
                                        sx={{
                                            "option": {
                                                backgroundColor: "#1f2937",
                                                color: "white",
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
                                        onChange={(e) => updatePaymentRow(payment.id, "amount", e.target.value)}
                                        placeholder="Amount"
                                        bg="rgba(17,24,39,0.72)"
                                        border="1px solid"
                                        borderColor="rgba(249,115,22,0.9)"
                                        color="white"
                                        borderRadius="md"
                                        height="48px"
                                        _focus={{ borderColor: "orange.400", boxShadow: "0 0 0 1px rgba(249,115,22,0.5)" }}
                                    />
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        bg="rgba(239,68,68,0.12)"
                                        color="red.200"
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
                            <Flex justify="space-between"><Text color="muted">Subtotal</Text><Text>{formatMoney(subtotal)}</Text></Flex>
                            <Flex justify="space-between"><Text color="muted">GST</Text><Text>{formatMoney(gstTotal)}</Text></Flex>
                            <Flex justify="space-between"><Text color="muted">Discount</Text><Text>- {formatMoney(discountTotal)}</Text></Flex>
                            <Flex justify="space-between" fontWeight={700}><Text>Total</Text><Text>{formatMoney(grandTotal)}</Text></Flex>
                            {selectedCustomer && <Flex justify="space-between"><Text color="muted">Customer credit applied</Text><Text color="green.300">- {formatMoney(creditUsed)}</Text></Flex>}
                            <Flex justify="space-between"><Text color="muted">Paid</Text><Text>{formatMoney(paymentTotal)}</Text></Flex>
                            <Flex justify="space-between" fontWeight={700} color={balanceDue <= 0 ? "green.300" : "orange.300"}>
                                <Text>Balance</Text>
                                <Text>{formatMoney(balanceDue)}</Text>
                            </Flex>
                        </VStack>

                        {statusMessage && (
                            <Box bg="rgba(249,115,22,0.12)" border="1px solid" borderColor="orange.500" color="orange.200" borderRadius="md" p={3}>
                                <Text fontSize="sm">{statusMessage}</Text>
                            </Box>
                        )}

                        <Button
                            colorScheme="orange"
                            size="lg"
                            isDisabled={!canFinalize}
                            onClick={finalizeInvoice}
                        >
                            Finalize billing
                        </Button>
                    </VStack>
                </Box>
            </SimpleGrid>

            <Modal isOpen={isCustomerModalOpen} onClose={() => setIsCustomerModalOpen(false)} isCentered>
                <ModalOverlay />
                <ModalContent bg="surface" color="white">
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
                            {customerFormError && (
                                <Text color="red.300" fontSize="sm">{customerFormError}</Text>
                            )}
                        </VStack>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setIsCustomerModalOpen(false)}>Cancel</Button>
                        <Button colorScheme="orange" onClick={handleAddCustomer}>Save customer</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </AppLayout>
    );
}
