import React, { useEffect, useState, useRef } from "react";
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
    Textarea,
    IconButton,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
    Spinner,
} from "@chakra-ui/react";
import { LuPlus, LuPencil, LuTrash2 } from "react-icons/lu";
import * as supplierService from "../services/supplierService";
import AppLayout from "../components/layout/AppLayout";

function SupplierForm({ initial, onClose, onSaved }) {
    const emptyForm = { supplierName: "", companyName: "", contactNumber: "", email: "", address: "", notes: "" };
    const [form, setForm] = useState(initial || emptyForm);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => setForm(initial || emptyForm), [initial]);

    function validate() {
        const e = {};
        if (!form.supplierName) e.supplierName = "Supplier name is required";
        if (!form.companyName) e.companyName = "Company name is required";
        if (!form.contactNumber) e.contactNumber = "Contact number is required";
        if (!form.email) e.email = "Email is required";
        setErrors(e);
        return Object.keys(e).length === 0;
    }

    async function handleSave() {
        if (!validate()) return;
        setSaving(true);
        try {
            if (initial && (initial.id || initial._id)) {
                const id = initial.id || initial._id;
                await supplierService.updateSupplier(id, form);
            } else {
                await supplierService.createSupplier(form);
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
                <FormControl isInvalid={!!errors.supplierName}>
                    <FormLabel>Supplier name</FormLabel>
                    <Input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} />
                    <FormErrorMessage>{errors.supplierName}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.companyName}>
                    <FormLabel>Company name</FormLabel>
                    <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
                    <FormErrorMessage>{errors.companyName}</FormErrorMessage>
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
            </SimpleGrid>

            <FormControl isInvalid={!!errors.address}>
                <FormLabel>Address</FormLabel>
                <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                <FormErrorMessage>{errors.address}</FormErrorMessage>
            </FormControl>

            <FormControl isInvalid={!!errors.notes}>
                <FormLabel>Notes</FormLabel>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                <FormErrorMessage>{errors.notes}</FormErrorMessage>
            </FormControl>

            <HStack justify="end" spacing={3} mt={2}>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button colorScheme="orange" onClick={handleSave} isLoading={saving}>Save</Button>
            </HStack>
        </VStack>
    );
}

export default function Suppliers() {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [suppliers, setSuppliers] = useState([]);
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
            const res = await supplierService.getSuppliers(params);
            const data = res.data;
            if (Array.isArray(data.suppliers)) {
                setSuppliers(data.suppliers);
                setTotal(data.pagination?.total ?? data.suppliers.length ?? 0);
            } else {
                setSuppliers(data || []);
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
    function openEdit(supplier) { setEditing(supplier); onOpen(); }

    async function handleDeleteConfirmed() {
        if (!deleteTarget) return;
        try {
            await supplierService.deleteSupplier(deleteTarget.id || deleteTarget._id || deleteTarget);
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
                    <Text fontSize="2xl" fontWeight={700}>Suppliers</Text>
                    <Badge>{total}</Badge>
                </HStack>

                <HStack spacing={3} flexWrap="wrap">
                    <Input placeholder="Search by name, company, email, or phone" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} width="300px" bg="card" borderColor="border" color="white" />
                    <Select value={sort} onChange={(e) => setSort(e.target.value)} width="180px" bg="card" borderColor="border" color="white" focusBorderColor="orange.300"
                        sx={{ option: { bg: "#0f172a", color: "white", _hover: { bg: "#1e293b" } } }}>
                        <option value="name_asc">Newest first</option>
                        <option value="name_desc">Oldest first</option>
                    </Select>
                    <Button leftIcon={<LuPlus />} colorScheme="orange" size="md" minW="150px" onClick={openCreate}>Add supplier</Button>
                </HStack>
            </HStack>

            <Box bg="surface" p={4} borderRadius="12px" border="1px solid" borderColor="border" minH="200px" overflowX="auto">
                {loading ? (
                    <Flex justify="center" align="center" minH="200px"><Spinner color="orange.400" /></Flex>
                ) : suppliers.length === 0 ? (
                    <Flex justify="center" align="center" minH="200px"><Text color="muted">No suppliers found. Add one to begin.</Text></Flex>
                ) : (
                    <Table variant="simple" size="sm">
                        <Thead>
                            <Tr>
                                <Th>Supplier</Th>
                                <Th>Company</Th>
                                <Th>Contact</Th>
                                <Th>Email</Th>
                                <Th>Actions</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {suppliers.map((supplier) => (
                                <Tr key={supplier.id || supplier._id}>
                                    <Td><Text fontWeight={600}>{supplier.supplierName}</Text></Td>
                                    <Td>{supplier.companyName}</Td>
                                    <Td>{supplier.contactNumber}</Td>
                                    <Td>{supplier.email}</Td>
                                    <Td>
                                        <HStack>
                                            <IconButton aria-label="Edit supplier" icon={<LuPencil />} size="sm" colorScheme="orange" variant="outline" onClick={() => openEdit(supplier)} />
                                            <IconButton aria-label="Delete supplier" icon={<LuTrash2 />} size="sm" colorScheme="red" variant="outline" onClick={() => { setDeleteTarget(supplier); onDeleteOpen(); }} />
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
                    <Button size="sm" variant="outline" colorScheme="orange" onClick={() => setPage((p) => p + 1)} disabled={suppliers.length < limit}>Next</Button>
                </HStack>
                <Text fontSize="sm" color="muted">Showing {suppliers.length} of {total}</Text>
            </HStack>

            <Modal isOpen={isOpen} onClose={onClose} size="lg">
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>{editing ? "Edit supplier" : "Add supplier"}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody p={6}>
                        <SupplierForm initial={editing} onClose={onClose} onSaved={load} />
                    </ModalBody>
                    <ModalFooter />
                </ModalContent>
            </Modal>

            <AlertDialog isOpen={isDeleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose}>
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">Delete supplier</AlertDialogHeader>
                        <AlertDialogBody>
                            Are you sure you want to delete {deleteTarget?.supplierName}? This action cannot be undone.
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