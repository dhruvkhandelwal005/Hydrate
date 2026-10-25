// import the landing page
import Landing from "./components/pages/Landing";

// the root component
export default function App() {
  // show the landing page, the button logs for now (swap in your router later)
  return <Landing onEnter={() => console.log("open case page")} />;
}