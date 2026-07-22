import { Box } from "@chakra-ui/react"

export default function AppCard({ children, ...props }) {
    return (
        <Box
            bg="card"
            rounded="2xl"
            p={8}
            border="1px solid"
            borderColor="border"
            boxShadow="0 10px 30px rgba(0,0,0,.18)"
            {...props}
        >
            {children}
        </Box>
    )
}