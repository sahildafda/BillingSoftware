import { Grid, GridItem } from "@chakra-ui/react";
import RegisterForm from "../../components/auth/RegisterForm";
import LoginLeftPanel from "../../components/auth/LoginLeftPanel";

export default function Register() {
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
                <RegisterForm />
            </GridItem>
        </Grid>
    );
}
