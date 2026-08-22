import React, { useEffect, useMemo, useState, useRef } from "react";
import {
    LuLayoutDashboard,
    LuPackage,
    LuUsers,
    LuTruck,
    LuChartColumn,
    LuPlus,
    LuPencil,
    LuTrash2,
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
    IconButton,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
    Spinner,
} from "@chakra-ui/react";
import * as customerService from "../services/customerService";
import AppLayout from "../components/layout/AppLayout";

function CustomerForm({ initial, onClose, onSaved }) {
    const [form, setForm] = useState(
        initial || { customerName: "", contactNumber: "", email: "", credit: 0, firmName: "", gstNo: "" }
    );
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => setForm(initial || { customerName: "", contactNumber: "", email: "", credit: 0 }), [initial]);

    function validate() {
        const e = {};
        if (!form.customerName) e.customerName = "Customer name is required";
        if (!form.contactNumber) e.contactNumber = "Contact number is required";
        if (!form.email) e.email = "Email is required";
        if (form.credit == null || Number(form.credit) < 0) e.credit = "Credit must be >= 0";
        setErrors(e);
        return Object.keys(e).length === 0;
    }

    async function handleSave() {
        if (!validate()) return;
        setSaving(true);
        try {
            if (initial && (initial.id || initial._id)) {
                const id = initial.id || initial._id;
                await customerService.updateCustomer(id, form);
            } else {
                await customerService.createCustomer(form);
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
                <FormControl isInvalid={!!errors.customerName}>
                    <FormLabel>Customer name</FormLabel>
                    <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
                    <FormErrorMessage>{errors.customerName}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.contactNumber}>
                    <FormLabel>Contact number</FormLabel>
                    <Input value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
                    <FormErrorMessage>{errors.contactNumber}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.email}>
                    <FormLabel>Email</FormLabel>
                    <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    <FormErrorMessage>{errors.email}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.credit}>
                    <FormLabel>Credit</FormLabel>
                    <Input type="number" min={0} value={form.credit} onChange={(e) => setForm({ ...form, credit: Number(e.target.value) })} />
                    <FormErrorMessage>{errors.credit}</FormErrorMessage>
                </FormControl>

                <FormControl>
                    <FormLabel>Firm name (optional)</FormLabel>
                    <Input value={form.firmName} onChange={(e) => setForm({ ...form, firmName: e.target.value })} />
                </FormControl>

                <FormControl>
                    <FormLabel>GST No (optional)</FormLabel>
                    <Input value={form.gstNo} onChange={(e) => setForm({ ...form, gstNo: e.target.value })} />
                </FormControl>
            </SimpleGrid>

            <HStack justify="end" spacing={3} mt={2}>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button colorScheme="orange" onClick={handleSave} isLoading={saving}>Save</Button>
            </HStack>
        </VStack>
    );
}

export default function Customers() {
    const navigate = useNavigate();
    const navigation = [
        { name: "Home", icon: LuLayoutDashboard, active: false },
        { name: "Products", icon: LuPackage, active: false },
        { name: "Customers", icon: LuUsers, active: true },
        { name: "Suppliers", icon: LuTruck, active: false },
        { name: "Reports", icon: LuChartColumn, active: false },
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
    const [customers, setCustomers] = useState([]);
    const [query, setQuery] = useState("");
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
            const params = {
                search: query || undefined,
                page,
                limit,
                sortOrder: sort === "name_asc" ? "asc" : "desc",
            };
            const res = await customerService.getCustomers(params);
            const data = res.data;
            if (Array.isArray(data.customers)) {
                setCustomers(data.customers);
                setTotal(data.pagination?.total ?? data.customers.length ?? 0);
            } else {
                setCustomers(data || []);
                setTotal(Array.isArray(data) ? data.length : 0);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, [query, sort, page, limit]);

    function openCreate() { setEditing(null); onOpen(); }
    function openEdit(customer) { setEditing(customer); onOpen(); }

    async function handleDeleteConfirmed() {
        if (!deleteTarget) return;
        try {
            await customerService.deleteCustomer(deleteTarget.id || deleteTarget._id || deleteTarget);
            setDeleteTarget(null);
            onDeleteClose();
            load();
        } catch (err) {
            console.error(err);
        }
    }

    return (
        <AppLayout>
            <HStack justify="space-between" mb={4} flexWrap="wrap">
                <HStack>
                    <Text fontSize="2xl" fontWeight={700}>Customers</Text>
                    <Badge>{total}</Badge>
                </HStack>

                <HStack spacing={3} flexWrap="wrap">
                    <Input placeholder="Search by name, email, or phone" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} width="280px" bg="card" borderColor="border" color="white" />
                    <Select value={sort} onChange={(e) => setSort(e.target.value)} width="180px" bg="card" borderColor="border" color="white"
                        focusBorderColor="orange.300"
                        sx={{ option: { bg: "#0f172a", color: "white", _hover: { bg: "#1e293b" } } }}>
                        <option value="name_asc">Name A–Z</option>
                        <option value="name_desc">Name Z–A</option>
                    </Select>
                    <Button leftIcon={<LuPlus />} colorScheme="orange" size="md" minW="150px" onClick={openCreate}>Add customer</Button>
                </HStack>
            </HStack>

            <Box bg="surface" p={4} borderRadius="12px" border="1px solid" borderColor="border" minH="200px" overflowX="auto">
                {loading ? (
                    <Flex justify="center" align="center" minH="200px"><Spinner color="orange.400" /></Flex>
                ) : customers.length === 0 ? (
                    <Flex justify="center" align="center" minH="200px"><Text color="muted">No customers found. Add one to begin.</Text></Flex>
                ) : (
                    <Table variant="simple" size="sm">
                        <Thead>
                            <Tr>
                                <Th>Name</Th>
                                <Th>Contact</Th>
                                <Th>Email</Th>
                                <Th>Credit</Th>
                                <Th>Actions</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {customers.map((customer) => (
                                <Tr key={customer.id || customer._id}>
                                    <Td><Text fontWeight={600}>{customer.customerName}</Text></Td>
                                    <Td>{customer.contactNumber}</Td>
                                    <Td>{customer.email}</Td>
                                    <Td>{customer.credit?.toFixed ? customer.credit.toFixed(2) : customer.credit}</Td>
                                    <Td>
                                        <HStack>
                                            <IconButton aria-label="Edit customer" icon={<LuPencil />} size="sm" colorScheme="orange" variant="outline" onClick={() => openEdit(customer)} />
                                            <IconButton aria-label="Delete customer" icon={<LuTrash2 />} size="sm" colorScheme="red" variant="outline" onClick={() => { setDeleteTarget(customer); onDeleteOpen(); }} />
                                        </HStack>
                                    </Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                )}
            </Box>

            <HStack justify="space-between">
                <HStack>
                    <Button size="sm" variant="outline" colorScheme="orange" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
                    <Text>Page {page}</Text>
                    <Button size="sm" variant="outline" colorScheme="orange" onClick={() => setPage((p) => p + 1)} disabled={customers.length < limit}>Next</Button>
                </HStack>
                <Text fontSize="sm" color="muted">Showing {customers.length} of {total}</Text>
            </HStack>

            <Modal isOpen={isOpen} onClose={onClose} size="lg">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>{editing ? "Edit customer" : "Add customer"}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody p={6}>
                        <CustomerForm initial={editing} onClose={onClose} onSaved={load} />
                    </ModalBody>
                    <ModalFooter />
                </ModalContent>
            </Modal>

            <AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose}>
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">Delete customer</AlertDialogHeader>
                        <AlertDialogBody>
                            Are you sure you want to delete {deleteTarget?.customerName}? This action cannot be undone.
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
