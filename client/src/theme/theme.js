import { extendTheme } from "@chakra-ui/react";

const theme = extendTheme({
    config: {
        initialColorMode: "light",
        useSystemColorMode: false,
    },
    colors: {
        primary: "#D97757",
        primaryHover: "#C46649",
    },
    semanticTokens: {
        colors: {
            background: { default: "#F7F4ED", _dark: "#171717" },
            surface: { default: "#FFFCF7", _dark: "#222222" },
            card: { default: "#F1EDE4", _dark: "#2B2B2B" },
            border: { default: "#DED8CC", _dark: "#3D3D3D" },
            text: { default: "#2D2926", _dark: "#F5F1EA" },
            muted: { default: "#746D66", _dark: "#AAA39B" },
            positive: { default: "#287A55", _dark: "#68D391" },
            warning: { default: "#A24B20", _dark: "#F6AD55" },
            danger: { default: "#B83232", _dark: "#FC8181" },
        },
    },
    radii: {
        xl: "16px",
        "2xl": "20px",
    },
    styles: {
        global: {
            "html, body": { bg: "background", color: "text" },
        },
    },
});

export default theme;
