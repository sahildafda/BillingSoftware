import { Grid, GridItem } from "@chakra-ui/react";
import LoginLeftPanel from "../../components/auth/LoginLeftPanel";
import LoginForm from "../../components/auth/LoginForm";

export default function Login() {
    return (
        <Grid
            templateColumns={{
                base: "1fr",
                lg: "1fr 520px",
            }}
            minH="100vh"
            bg="background"
        >
            <GridItem display={{ base: "none", lg: "block" }}>
                <LoginLeftPanel />
            </GridItem>

            <GridItem>
                <LoginForm />
            </GridItem>
        </Grid>
    );
}