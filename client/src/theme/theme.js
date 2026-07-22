import { extendTheme } from "@chakra-ui/react";

const theme = extendTheme({
    colors: {
        background: "#1B1C1E",
        surface: "#232427",
        card: "#2A2B2E",
        border: "#343541",
        primary: "#D97757",
        primaryHover: "#C46649",
        text: "#FFFFFF",
        muted: "#9CA3AF",
    },
    radii: {
        xl: "16px",
        "2xl": "20px",
    },
});

export default theme;