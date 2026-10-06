"use client";
import {useMemo,useState} from "react";

const products=[
{id:1,name:"Paracetamol 500 mg 10 Tablet",cat:"Obat",price:12500,icon:"💊",rating:"4.9"},
{id:2,name:"Vitamin C 1000 mg 10 Tablet",cat:"Vitamin",price:25000,icon:"🟠",rating:"4.8"},
{id:3,name:"Strepsils Honey & Lemon 8 Tablet",cat:"Obat",price:32500,icon:"🍯",rating:"4.9"},
{id:4,name:"Cetaphil Gentle Skin Cleanser 250 ml",cat:"Perawatan Pribadi",price:115000,icon:"🧴",rating:"4.9"},
{id:5,name:"Omron Tensimeter HEM-7121",cat:"Alat Kesehatan",price:420000,icon:"🩺",rating:"4.9"},
{id:6,name:"Minyak Telon 60 ml",cat:"Ibu & Anak",price:28000,icon:"👶",rating:"4.8"}];
const cats=[["Obat","💊"],["Vitamin","🧴"],["Ibu & Anak","👶"],["Perawatan Pribadi","🧼"],["Alat Kesehatan","🩺"],["Herbal","🌿"]];
const rupiah=n=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);

export default function Home(){
 const[q,setQ]=useState(""); const[cat,setCat]=useState("Semua"); const[cart,setCart]=useState([]); const[consult,setConsult]=useState(false); const[checkout,setCheckout]=useState(false); const[done,setDone]=useState("");
 const shown=useMemo(()=>products.filter(p=>(!q||p.name.toLowerCase().includes(q.toLowerCase())||p.cat.toLowerCase().includes(q.toLowerCase()))&&(cat==="Semua"||p.cat===cat)),[q,cat]);
 const count=cart.reduce((a,b)=>a+b.qty,0), total=cart.reduce((a,b)=>a+b.qty*b.price,0);
 const add=p=>setCart(v=>{const e=v.find(x=>x.id===p.i���q�^