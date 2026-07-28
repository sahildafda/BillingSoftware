import {
    Avatar,
    Box,
    HStack,
    Icon,
    IconButton,
    Menu,
    MenuButton,
    MenuItem,
    MenuList,
    Portal,
    Text,
    Tooltip,
    VStack,
} from "@chakra-ui/react";
import {
    LuChartColumn,
    LuChevronLeft,
    LuChevronRight,
    LuLayoutDashboard,
    LuLogOut,
    LuPackage,
    LuReceipt,
    LuTruck,
    LuUsers,
} from "react-icons/lu";
import { useNavigate } from "react-router-dom";

import Logo from "../ui/Logo";
import { ROUTES } from "../../constants/routes";

export const NAV_ITEMS = [
    { name: "Dashboard", icon: LuLayoutDashboard, route: ROUTES.DASHBOARD },
    { name: "Products", icon: LuPackage, route: ROUTES.PRODUCTS },
    { name: "Customers", icon: LuUsers, route: ROUTES.CUSTOMERS },
    { name: "Suppliers", icon: LuTruck, route: ROUTES.SUPPLIERS },
    { name: "Reports", icon: LuChartColumn, route: ROUTES.REPORTS },
];

export default function Sidebar({ collapsed, onToggle, activePath }) {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("authUser") || "null");

    function handleLogout() {
        localStorage.removeItem("authToken");
        localStorage.removeItem("authUser");
        navigate(ROUTES.LOGIN, { replace: true });
    }

    return (
        <Box
            w={{ base: "100%", lg: collapsed ? "92px" : "280px" }}
            minH={{ base: "auto", lg: "100vh" }}
            bg="surface"
            borderRight={{ base: "none", lg: "1px solid" }}
            borderColor="border"
            p={collapsed ? 3 : 6}
            display="flex"
            flexDirection="column"
            justifyContent="space-between"
            overflow="hidden"
            transition="width 0.18s ease"
            position={{ base: "relative", lg: "sticky" }}
            top={{ base: "auto", lg: 0 }}
            height={{ base: "auto", lg: "100vh" }}
        >
            <Box>
                <HStack justify={collapsed ? "center" : "space-between"} align="center" mb={6}>
                    {collapsed ? (
                        <></>
                    ) : (
                        <Logo />
                    )}

                    <IconButton
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        icon={<Icon as={collapsed ? LuChevronRight : LuChevronLeft} />}
                        size="sm"
                        variant="ghost"
                        color="muted"
                        onClick={onToggle}
                        _hover={{ bg: "card", color: "primary" }}
                    />
                </HStack>

                <VStack align={collapsed ? "center" : "stretch"} spacing={4} mt={2}>
                    {NAV_ITEMS.map((item) => {
                        const isActive = activePath === item.route;

                        return (
                            <Box key={item.name} w="100%" display="flex" justifyContent="center">
                                <Tooltip label={item.name} placement="right" isDisabled={!collapsed} hasArrow>
                                    <Box
                                        as="button"
                                        onClick={() => navigate(item.route)}
                                        role="group"
                                        display="flex"
                                        alignItems="center"
                                        justifyContent={collapsed ? "center" : "flex-start"}
                                        gap={collapsed ? 0 : 3}
                                        px={collapsed ? 0 : 4}
                                        py={2}
                                        w={collapsed ? "48px" : "100%"}
                                        bg={isActive ? "rgba(217,119,87,0.12)" : "transparent"}
                                        borderRadius={isActive ? "14px" : "12px"}
                                        borderLeft={isActive && !collapsed ? "4px solid" : undefined}
                                        borderLeftColor={isActive ? "primary" : undefined}
                                        transition="all 0.18s ease"
                                        _hover={{ transform: collapsed ? "none" : "translateX(4px)", boxShadow: "sm" }}
                                        _focus={{ boxShadow: "outline" }}
                                    >
                                        <Box
                                            bg={isActive ? "primary" : "transparent"}
                                            color={isActive ? "white" : "gray.300"}
                                            p={3}
                                            borderRadius="12px"
                                            display="flex"
                                            alignItems="center"
                                            justifyContent="center"
                                            boxShadow={isActive ? "lg" : "none"}
                                            minW="40px"
                                            minH="40px"
                                        >
                                            <Icon as={item.icon} boxSize={5} />
                                        </Box>

                                        {!collapsed && (
                                            <Text ml={3} color={isActive ? "white" : "gray.300"} fontWeight={600}>
                                                {item.name}
                                            </Text>
                                        )}
                                    </Box>
                                </Tooltip>
                            </Box>
                        );
                    })}
                </VStack>
            </Box>

            <Box position="relative">
                <Box position="absolute" left={collapsed ? 3 : 6} bottom={6}>
                    <Menu placement={collapsed ? "right-end" : "top-start"} strategy="fixed">
                        <Tooltip label="Account" placement="right" isDisabled={!collapsed} hasArrow>
                            <MenuButton
                                as={Box}
                                cursor="pointer"
                                position="relative"
                                borderRadius="12px"
                                _hover={{ opacity: 0.85 }}
                            >
                                <Avatar name={user?.companyName || "Admin"} bg="primary" color="white" size={collapsed ? "sm" : "md"} />
                                {!collapsed && (
                                    <Box position="absolute" left="56px" top="6px" whiteSpace="nowrap">
                                        <Text fontWeight="700">{user?.companyName || "Billing Hub"}</Text>
                                        <Text fontSize="sm" color="muted">{user?.email || "admin@billingsoftware.com"}</Text>
                                    </Box>
                                )}
                            </MenuButton>
                        </Tooltip>
                        <Portal>
                            <MenuList
                                bg="surface"
                                borderColor="border"
                                minW="180px"
                                zIndex="popover"
                                boxShadow="lg"
                            >
                                <MenuItem
                                    icon={<LuLogOut />}
                                    onClick={handleLogout}
                                    bg="surface"
                                    color="red.300"
                                    whiteSpace="nowrap"
                                    _hover={{ bg: "card" }}
                                    _focus={{ bg: "card" }}
                                >
                                    Logout
                                </MenuItem>
                            </MenuList>
                        </Portal>
                    </Menu>
                </Box>
            </Box>
        </Box>
    );
}