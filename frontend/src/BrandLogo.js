import React from "react";
import logoImage from "./assets/logo.jpg";

function BrandLogo({ className = "", title = "ELOGIXA logo", src }) {
  return <img className={className} src={src || logoImage} alt={title} />;
}

export default BrandLogo;
