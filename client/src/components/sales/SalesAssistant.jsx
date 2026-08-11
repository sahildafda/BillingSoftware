import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
    Badge, Box, Button, Divider, HStack, IconButton, Input, Spinner, Stack, Text, Tooltip, VStack,
} from "@chakra-ui/react";
import { LuBot, LuChevronDown, LuSend, LuSparkles, LuX } from "react-icons/lu";

function authHeaders() {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

export default function SalesAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [insights, setInsights] = useState(null);
    const [messages, setMessages] = useState([]);
    const [question, setQuestion] = useState("");
    const [loadingInsights, setLoadingInsights] = useState(false);
    const [asking, setAsking] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    async function loadInsights() {
        setLoadingInsights(true);
        setError("");
        try {
            const response = await axios.get("/api/sales-assistant/insights", { headers: authHeaders() });
            setInsights(response.data);
        } catch (requestError) {
            setError(requestError?.response?.data?.message || "Unable to load sales insights.");
        } finally {
            setLoadingInsights(false);
        }
    }

    function openAssistant() {
        setIsOpen(true);
        if (!insights && !loadingInsights) loadInsights();
    }

    async function askQuestion(event) {
        event.preventDefault();
        const trimmedQuestion = question.trim();
        if (!trimmedQuestion || asking) return;

        setQuestion("");
        setMessages((current) => [...current, { role: "user", text: trimmedQuestion }]);
        setAsking(true);
        setError("");
        try {
            const response = await axios.post("/api/sales-assistant/ask", { question: trimmedQuestion }, { headers: authHeaders() });
            setMessages((current) => [...current, { role: "assistant", text: response.data.answer }]);
        } catch (requestError) {
            setError(requestError?.response?.data?.message || "I could not answer that question right now.");
        } finally {
            setAsking(false);
        }
    }

    const prompts = ["What products are in demand?", "Which products have low demand?", "What should I reorder?", "Who are my top customers?"];

    return (
        <Box position="fixed" right={{ base: 4, md: 6 }} bottom={{ base: 4, md: 6 }} zIndex="popover">
            {isOpen && (
                <Box w={{ base: "calc(100vw - 32px)", sm: "390px" }} maxH="min(680px, calc(100vh - 100px))" mb={3} overflow="hidden" bg="surface" border="1px solid" borderColor="orange.400" rounded="2xl" boxShadow="2xl">
                    <HStack px={5} py={4} bgGradient="linear(135deg, primary 0%, #f59e0b 100%)" justify="space-between">
                        <HStack spacing={3}><Box bg="whiteAlpha.300" p={2} rounded="lg"><LuSparkles /></Box><Box><Text fontWeight="700">Sales Assistant</Text><Text fontSize="xs" color="whiteAlpha.900">Private insights from your billing data</Text></Box></HStack>
                        <IconButton aria-label="Close sales assistant" icon={<LuX />} size="sm" variant="ghost" color="white" _hover={{ bg: "whiteAlpha.200" }} onClick={() => setIsOpen(false)} />
                    </HStack>
                    <Box p={4} overflowY="auto" maxH="520px">
                        {loadingInsights ? <Box py={10} textAlign="center"><Spinner color="orange.400" /><Text mt={3} color="muted" fontSize="sm">Analysing your sales data…</Text></Box> : <Stack spacing={4}>
                            {insights && <Box bg="card" rounded="xl" p={4}>
                                <HStack justify="space-between" mb={2}><Text fontSize="sm" color="muted">Last 30 days</Text><Badge colorScheme={insights.sales.revenueChangePercent >= 0 ? "green" : "red"}>{insights.sales.revenueChangePercent === null ? "New" : `${insights.sales.revenueChangePercent >= 0 ? "+" : ""}${insights.sales.revenueChangePercent.toFixed(1)}%`}</Badge></HStack>
                                <Text fontSize="xl" fontWeight="700">{formatMoney(insights.sales.revenue30Days)}</Text><Text color="muted" fontSize="sm">{insights.sales.orders30Days} orders</Text>
                                <Divider my={3} borderColor="border" />
                                <Text fontSize="sm" fontWeight="600">In demand</Text>
                                <Text fontSize="sm" color="muted">{insights.topProducts?.length ? insights.topProducts.slice(0, 3).map((item) => `${item.productName} (${item.units30Days})`).join(" · ") : "No sales data yet"}</Text>
                                {insights.lowStockProducts?.length > 0 && <Text mt={2} fontSize="sm" color="orange.300">Reorder: {insights.lowStockProducts.slice(0, 2).map((item) => `${item.productName} (${item.stock} left)`).join(" · ")}</Text>}
                            </Box>}
                            {messages.map((message, index) => <Box key={`${message.role}-${index}`} alignSelf={message.role === "user" ? "flex-end" : "flex-start"} bg={message.role === "user" ? "primary" : "card"} rounded="xl" px={3} py={2} maxW="92%"><Text fontSize="sm">{message.text}</Text></Box>)}
                            {asking && <HStack color="muted"><Spinner size="xs" /><Text fontSize="sm">Checking your data…</Text></HStack>}
                            {!messages.length && <VStack align="stretch" spacing={2}><Text fontSize="sm" color="muted">Try asking:</Text>{prompts.map((prompt) => <Button key={prompt} size="sm" justifyContent="flex-start" variant="outline" borderColor="border" whiteSpace="normal" h="auto" py={2} onClick={() => setQuestion(prompt)}>{prompt}</Button>)}</VStack>}
                        </Stack>}
                        {error && <Text mt={3} color="red.300" fontSize="sm">{error}</Text>}
                    </Box>
                    <Box as="form" onSubmit={askQuestion} p={3} borderTop="1px solid" borderColor="border"><HStack><Input ref={inputRef} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about sales, products, or customers…" bg="card" borderColor="border" /><IconButton type="submit" aria-label="Ask sales assistant" icon={<LuSend />} colorScheme="orange" isLoading={asking} /></HStack></Box>
                </Box>
            )}
            <Tooltip label={isOpen ? "Minimise sales assistant" : "Ask the sales assistant"} hasArrow>
                <IconButton aria-label="Open sales assistant" icon={isOpen ? <LuChevronDown /> : <LuBot />} size="lg" rounded="full" colorScheme="orange" boxShadow="xl" onClick={() => isOpen ? setIsOpen(false) : openAssistant()} />
            </Tooltip>
        </Box>
    );
}
