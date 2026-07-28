import React, { useEffect, useMemo, useState, useRef } from "react";
import {
    LuLayoutDashboard,
    LuPackage,
    LuUsers,
    LuTruck,
    LuChartColumn,
} from "react-icons/lu";
import Logo from "../components/ui/Logo";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../constants/routes";
import {
    Badge,
    Box,
    Button,
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
    SimpleGrid,
    Table,
    Tbody,
    Td,
    Th,
    Thead,
    Tr,
    Text,
    useDisclosure,
    VStack,
    FormControl,
    FormLabel,
    FormErrorMessage,
    NumberInput,
    NumberInputField,
    Icon,
    IconButton,
    Textarea,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
    Spinner,
} from "@chakra-ui/react";
import { LuPlus, LuPencil, LuTrash2 } from "react-icons/lu";
import * as productService from "../services/productService";
import AppLayout from "../components/layout/AppLayout";

function ProductForm({ initial, onClose, onSaved }) {
    const [form, setForm] = useState(
        initial || { productName: "", barcode: "", brand: "", productPrice: 0, sellingPrice: 0, stock: 0, gstPercentage: 0, discount: 0 }
    );
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => setForm(initial || { productName: "", barcode: "", brand: "", productPrice: 0, sellingPrice: 0, stock: 0, gstPercentage: 0, discount: 0 }), [initial]);

    function validate() {
        const e = {};
        if (!form.productName) e.productName = "Product name is required";
        if (!form.barcode) e.barcode = "SKU / barcode is required";
        if (!form.brand) e.brand = "Brand is required";
        if (form.productPrice == null || Number(form.productPrice) < 0) e.productPrice = "Price must be >= 0";
        if (form.sellingPrice == null || Number(form.sellingPrice) < 0) e.sellingPrice = "Selling price must be >= 0";
        if (form.stock == null || Number(form.stock) < 0) e.stock = "Stock must be >= 0";
        if (form.gstPercentage == null || Number(form.gstPercentage) < 0) e.gstPercentage = "GST % must be >= 0";
        if (form.discount == null || Number(form.discount) < 0) e.discount = "Discount must be >= 0";
        setErrors(e);
        return Object.keys(e).length === 0;
    }

    async function handleSave() {
        if (!validate()) return;
        setSaving(true);
        try {
            if (initial && (initial.id || initial._id)) {
                const id = initial.id || initial._id;
                await productService.updateProduct(id, form);
            } else {
                await productService.createProduct(form);
            }
            if (onSaved) await onSaved();
            onClose && onClose();
        } catch (err) {
            const data = err?.response?.data;
            if (data && typeof data === "object") {
                if (data.errors) setErrors(data.errors);
                else if (data.message) setErrors({ _form: data.message });
            }
            console.error(err);
        } finally {
            setSaving(false);
        }
    }

    return (
        <VStack spacing={4} align="stretch">
            {errors._form && (
                <Box bg="red.900" p={2} borderRadius="8px">
                    <Text color="white">{errors._form}</Text>
                </Box>
            )}

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isInvalid={!!errors.productName}>
                    <FormLabel>Product name</FormLabel>
                    <Input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
                    <FormErrorMessage>{errors.productName}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.barcode}>
                    <FormLabel>SKU / Barcode</FormLabel>
                    <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                    <FormErrorMessage>{errors.barcode}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.brand}>
                    <FormLabel>Brand</FormLabel>
                    <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                    <FormErrorMessage>{errors.brand}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.productPrice}>
                    <FormLabel>Cost Price</FormLabel>
                    <NumberInput min={0} value={form.productPrice} onChange={(value) => setForm({ ...form, productPrice: Number(value) })}>
                        <NumberInputField />
                    </NumberInput>
                    <FormErrorMessage>{errors.productPrice}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.sellingPrice}>
                    <FormLabel>Selling Price</FormLabel>
                    <NumberInput min={0} value={form.sellingPrice} onChange={(value) => setForm({ ...form, sellingPrice: Number(value) })}>
                        <NumberInputField />
                    </NumberInput>
                    <FormErrorMessage>{errors.sellingPrice}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.stock}>
                    <FormLabel>Stock</FormLabel>
                    <NumberInput min={0} value={form.stock} onChange={(value) => setForm({ ...form, stock: Number(value) })}>
                        <NumberInputField />
                    </NumberInput>
                    <FormErrorMessage>{errors.stock}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.gstPercentage}>
                    <FormLabel>GST %</FormLabel>
                    <NumberInput min={0} value={form.gstPercentage} onChange={(value) => setForm({ ...form, gstPercentage: Number(value) })}>
                        <NumberInputField />
                    </NumberInput>
                    <FormErrorMessage>{errors.gstPercentage}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.discount}>
                    <FormLabel>Discount %</FormLabel>
                    <NumberInput min={0} value={form.discount} onChange={(value) => setForm({ ...form, discount: Number(value) })}>
                        <NumberInputField />
                    </NumberInput>
                    <FormErrorMessage>{errors.discount}</FormErrorMessage>
                </FormControl>
            </SimpleGrid>

            <HStack justify="end" spacing={3} mt={2}>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button colorScheme="orange" onClick={handleSave} isLoading={saving}>Save</Button>
            </HStack>
        </VStack>
    );
}

export default function Products() {
    const navigate = useNavigate();
    const navigation = [
        { name: "Home", icon: LuLayoutDashboard, active: false },
        { name: "Products", icon: LuPackage, active: true },
        { name: "Customers", icon: LuUsers },
        { name: "Suppliers", icon: LuTruck },
        { name: "Reports", icon: LuChartColumn },
    ];
    const routeMap = {
        Home: ROUTES.DASHBOARD,
        Products: ROUTES.PRODUCTS,
        Customers: ROUTES.CUSTOMERS,
        Suppliers: ROUTES.SUPPLIERS,
        Reports: ROUTES.REPORTS,
    };

    const [collapsed, setCollapsed] = useState(false);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [products, setProducts] = useState([]);
    const [query, setQuery] = useState("");
    const [brand, setBrand] = useState("");
    const [sort, setSort] = useState("name_asc");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
    const cancelRef = useRef();

    async function load() {
        setLoading(true);
        try {
            const sortLookup = {
                name_asc: { sortBy: "productName", sortOrder: "asc" },
                name_desc: { sortBy: "productName", sortOrder: "desc" },
                price_asc: { sortBy: "productPrice", sortOrder: "asc" },
                price_desc: { sortBy: "productPrice", sortOrder: "desc" },
            };
            const { sortBy, sortOrder } = sortLookup[sort] || { sortBy: "createdAt", sortOrder: "desc" };
            const params = {
                search: query || undefined,
                brand: brand || undefined,
                page,
                limit,
                sortBy,
                sortOrder,
            };
            const res = await productService.getProducts(params);
            const d = res.data;
            if (Array.isArray(d)) {
                setProducts(d);
                setTotal(res.headers?.["x-total-count"] ? Number(res.headers["x-total-count"]) : d.length);
            } else if (d && d.items) {
                setProducts(d.items);
                setTotal(d.total || d.count || 0);
            } else if (d && d.products) {
                setProducts(d.products);
                setTotal(d.pagination?.total ?? d.products.length ?? 0);
            } else {
                setProducts(d || []);
                setTotal((Array.isArray(d) && d.length) || 0);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, [query, brand, sort, page, limit]);

    const brands = useMemo(() => {
        const set = new Set(products.map((p) => p.brand).filter(Boolean));
        return Array.from(set);
    }, [products]);

    function openCreate() { setEditing(null); onOpen(); }
    function openEdit(p) { setEditing(p); onOpen(); }

    async function handleDeleteConfirmed() {
        if (!deleteTarget) return;
        try {
            await productService.deleteProduct(deleteTarget.id || deleteTarget._id || deleteTarget);
            setDeleteTarget(null);
            onDeleteClose();
            load();
        } catch (err) {
            console.error(err);
        }
    }

    return (
        <AppLayout>
            <HStack justify="space-between" mb={4}>
                <HStack>
                    <Text fontSize="2xl" fontWeight={700}>Products</Text>
                    <Badge>{total}</Badge>
                </HStack>

                <HStack spacing={3} flexWrap="wrap">
                    <Input placeholder="Search by name or SKU" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} width="280px" bg="card" borderColor="border" color="white" />
                    <Select
                        placeholder="Brand"
                        value={brand}
                        onChange={(e) => { setBrand(e.target.value); setPage(1); }}
                        width="180px"
                        bg="card"
                        borderColor="border"
                        color="white"
                        iconColor="white"
                        focusBorderColor="orange.300"
                        sx={{ option: { bg: "#0f172a", color: "white", _hover: { bg: "#1e293b" } } }}
                    >
                        {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                    </Select>
                    <Select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                        width="160px"
                        bg="card"
                        borderColor="border"
                        color="white"
                        iconColor="white"
                        focusBorderColor="orange.300"
                        sx={{ option: { bg: "#0f172a", color: "white", _hover: { bg: "#1e293b" } } }}
                    >
                        <option value="name_asc">Name A–Z</option>
                        <option value="name_desc">Name Z–A</option>
                        <option value="price_asc">Price ↑</option>
                        <option value="price_desc">Price ↓</option>
                    </Select>
                    <Button leftIcon={<LuPlus />} colorScheme="orange" size="md" minW="150px" onClick={openCreate}>Add product</Button>
                </HStack>
            </HStack>

            <Box bg="surface" p={4} borderRadius="12px" border="1px solid" borderColor="border" minH="200px" overflowX="auto">
                {loading ? (
                    <Flex justify="center" align="center" minH="200px"><Spinner color="orange.400" /></Flex>
                ) : products.length === 0 ? (
                    <Flex justify="center" align="center" minH="200px"><Text color="muted">No products found. Add one to begin.</Text></Flex>
                ) : (
                    <Table variant="simple" size="sm">
                        <Thead>
                            <Tr>
                                <Th>Name</Th><Th>SKU</Th><Th>Brand</Th><Th>Price</Th><Th>Stock</Th><Th>Actions</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {products.map((p) => (
                                <Tr key={p.id || p._id}>
                                    <Td><Text fontWeight={600}>{p.productName}</Text></Td>
                                    <Td>{p.barcode}</Td>
                                    <Td>{p.brand}</Td>
                                    <Td>{p.productPrice?.toFixed ? p.productPrice.toFixed(2) : p.productPrice}</Td>
                                    <Td>{p.stock}</Td>
                                    <Td>
                                        <HStack>
                                            <IconButton aria-label="Edit product" icon={<LuPencil />} size="sm" colorScheme="orange" variant="outline" onClick={() => openEdit(p)} />
                                            <IconButton aria-label="Delete product" icon={<LuTrash2 />} size="sm" colorScheme="red" variant="outline" onClick={() => { setDeleteTarget(p); onDeleteOpen(); }} />
                                        </HStack>
                                    </Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                )}
            </Box>

            <HStack justify="space-between" mt={4}>
                <HStack>
                    <Button size="sm" variant="outline" colorScheme="orange" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
                    <Text>Page {page}</Text>
                    <Button size="sm" variant="outline" colorScheme="orange" onClick={() => setPage((p) => p + 1)} disabled={products.length < limit}>Next</Button>
                </HStack>
                <Text fontSize="sm" color="muted">Showing {products.length} of {total}</Text>
            </HStack>

            <Modal isOpen={isOpen} onClose={onClose} size="lg">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>{editing ? "Edit product" : "Add product"}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody p={6}>
                        <ProductForm initial={editing} onClose={onClose} onSaved={load} />
                    </ModalBody>
                    <ModalFooter />
                </ModalContent>
            </Modal>

            <AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose}>
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">Delete product</AlertDialogHeader>
                        <AlertDialogBody>
                            Are you sure you want to delete {deleteTarget?.productName}? This action cannot be undone.
                        </AlertDialogBody>
                        <AlertDialogFooter>
                            <Button ref={cancelRef} variant="outline" onClick={onDeleteClose}>Cancel</Button>
                            <Button colorScheme="red" onClick={handleDeleteConfirmed} ml={3}>Delete</Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
        </AppLayout>
    );
}
