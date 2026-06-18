# Settings Math

This document explains the math behind certain settings so that you can understand how changing those settings affects the experience.

## Familiarity Weighting

A few features use weighted random selection based on familiarity score. The formula to calculate the weight, where `f` is familiarity, is:

$1 + w \cdot \ln(1 + f)$

The `w` represents the `Familiarity weight multiplier` setting, which is 1 by default.

A few sample outputs of this function:  
f = 0, w = 1 -> 1  
f = 10, w = 1 -> 3.4  
f = 20, w = 1 -> 4  
f = 30, w = 1 -> 4.4  
f = 100, w = 1 -> 5.6  
f = 100, w = 2 -> 10.2

As you can see, dimishing returns come quickly.
